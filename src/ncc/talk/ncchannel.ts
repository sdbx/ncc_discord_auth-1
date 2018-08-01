import * as get from "get-value";
import * as io from "socket.io-client";
import { EventDispatcher, IEventHandler } from "strongly-typed-events";
import Log from "../../log";
import Cafe from "../../structure/cafe";
import Profile from "../../structure/profile";
import NCredit from "../credit/ncredit";
import { CHAT_API_URL, CHAT_APIS, CHAT_BACKEND_URL, CHAT_HOME_URL, COOKIE_SITES, NcIDBase } from "../ncconstant";
import { getFirst } from "../nccutil";
import NcBaseChannel, { INcChannel } from "./ncbasechannel";
import NcMessage from "./ncmessage";

export default class NcChannel extends NcBaseChannel {
    /**
     * Parse NcChannel from..
     * @param credit 
     * @param id 
     */
    public static async from(credit:NCredit, id:number | NcBaseChannel) {
        id = (typeof id === "number") ? id : id.channelID;
        const instance = new NcChannel();
        try {
            await instance.update(credit, id);
        } catch (err) {
            return null;
        }
        return instance;
    }
    /**
     * Channel Users
     */
    public users:NccMember[];
    /**
     * Socket.io session of channel
     */
    public session:SocketIOClient.Socket;
    /**
     * Fetched messages
     */
    public messages:Map<number, NcMessage> = new Map();
    /**
     * events
     */
    public events:Events = new Events();
    /**
     * Credit for internal use
     */
    protected credit:NCredit = null;
    private constructor() {
        super(null);
    }
    /**
     * Register event
     * @param dispatcher this.events 
     * @param handler function
     */
    public on<V>(dispatcher:EventDispatcher<NcChannel, V>, handler:IEventHandler<NcChannel, V>) {
        dispatcher.asEvent().subscribe(handler);
    }
    public async connect(credit:NCredit) {
        const channel = this.channelID;
        this.credit = credit;
        this.session = io(`${CHAT_BACKEND_URL}/chat`, {
            multiplex: false,
            timeout: 5000,
            host:CHAT_BACKEND_URL,
            reconnection: true,
            reconnectionAttempts: 100,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 1000,
            forceNew: true,
            // forceJSONP: true,
            transports: ["polling", "websocket"],
            transportOptions: {
                polling: {
                    extraHeaders: {
                        "Origin": CHAT_HOME_URL,
                        "Referer": `${CHAT_HOME_URL}/channels/${channel}`,
                    },
                },
                websocket: {
                    extraHeaders: {
                        "Origin": CHAT_HOME_URL,
                        "Referer": `${CHAT_HOME_URL}/channels/${channel}`,
                    },
                },
            },
            query: {
                accessToken: credit.accessToken,
                userId: credit.username,
                channelNo: channel,
            },
        });
        this.registerE(this.session);
        for (const errE of ["error", "connect_error", "reconnect_failed"]) {
            this.session.on(errE, (t) => {
                Log.d(errE, t);
            });
        }
        for (const successE of ["connect", "connect_timeout", "reconnecting", "disconnect"]) {
            this.session.on(successE, () => {
                Log.d(successE + "");
            });
        }
        for (const naverE of Object.values(ChannelEvent)) {
            if (naverE === ChannelEvent.MESSAGE) {
                continue;
            }
            this.session.on(naverE, (t) => {
                Log.i(naverE);
                Log.e(t);
            });
        }
        this.session.open();
    }
    public async fetchChannel() {
        return this.update();
    }
    public async update(credit:NCredit = null, id = -1) {
        if (id < 0) {
            id = this.channelID;
        } else {
            this.channelID = id;
        }
        if (credit != null) {
            this.credit = credit;
        } else {
            credit = this.credit;
        }
        try {
            const sync = JSON.parse(await credit.reqGet(`${CHAT_API_URL}/channels/${id.toString(10)}/sync`));
            if (get(sync, "message.status", {default: "-1"}) !== "200") {
                Log.e("Wrong status code! - " + get(sync, "message.error.msg"));
                // @todo error.code 3006: Not joined room.
                return Promise.reject(get(sync, "message.error.msg"));
            }
            const channelI = get(sync, "message.result.channel");
            this.baseinfo = {...channelI} as INcChannel;

            const memberList = get(sync, "message.result.memberList") as object[];
            this.users = memberList.map((v) => {
                const serial = {...v} as IChannelMember;
                return {
                    ...this.cafe,
                    profileurl: serial.memberProfileImageUrl,
                    nickname: serial.nickname,
                    userid: serial.memberId,
                    kickable: serial.kickedable,
                    channelManageable: serial.channelManageable,
                } as NccMember;
            });
            return Promise.resolve();
        } catch (err) {
            Log.e(err);
            return Promise.reject(err);
        }
    }
    protected registerE(s:SocketIOClient.Socket) {
        // message
        s.on(ChannelEvent.MESSAGE, async (eventmsg:object) => {
            const message = this.serialMsg(eventmsg);
            if (message == null) {
                return Promise.resolve();
            }
            this.events.onMessage.dispatchAsync(this, message);
        });
        // member join
        s.on(ChannelEvent.JOIN, async (eventmsg:object) => {
            const msg = {channelID: eventmsg["channelNo"]};
            const join = new Join(this.users);
            await this.fetchChannel();
            join.fetch(this.users);
            this.events.onMemberJoin.dispatchAsync(this, join);
        });
        // member quit
        s.on(ChannelEvent.QUIT, async (eventmsg:object) => {
            const users = get(eventmsg, "userIdList", { default: [] }) as string[];
            const msg = {
                channelID: get(eventmsg, "channelNo"),
                userIDs: users,
                members: users.map((v) => getFirst(this.users.filter((_v) => _v.userid === v))),
                deletedChannel: get(eventmsg, "deletedChannel"),
            } as Quit;
            await this.fetchChannel();
            this.events.onMemberQuit.dispatchAsync(this, msg);
        });
    }
    private serialMsg(msg:object) {
        if (get(msg, "channelNo") !== this.channelID) {
            Log.w("Message's channelID doesn't match.");
            return null;
        }
        const _message = get(msg, "message") as IEventMessage;
        if (_message.extras != null && _message.extras.length <= 0) {
            _message.extras = null;
        }
        const ncMsg = new NcMessage({
            id: _message.serialNumber,
            body: _message.contents,
            writerId: _message.userId,
            writerName: this.getNick(_message.userId, "Kicked User"),
            type: _message.typeCode,
            createdTime: _message.createTime,
            extras: _message.extras,
        }, this.cafe, this.channelID);
        ncMsg.readCount = Math.max(0, _message.readCount);
        return ncMsg;
    }
    private getNick(id:string, fallback:string = null) {
        const nick = getFirst(this.users.filter((v) => v.userid === id));
        return nick == null ? fallback : nick.nickname;
    }
}
class Events {
    public onMessage = new EventDispatcher<NcChannel, NcMessage>();
    public onMemberJoin = new EventDispatcher<NcChannel, Join>();
    public onMemberQuit = new EventDispatcher<NcChannel, Quit>();
}
export enum ChannelEvent {
    SYSTEM = "sys",
    MESSAGE = "msg",
    ACK = "ack",
    JOIN = "join",
    QUIT = "quit",
    KICK = "kick",
    BLOCK = "block", // ban
    LEAVE = "leave",
    BLIND = "blind",
    EVENT = "event", // message?
    EMOTION = "emotion",
}
export interface NccMember extends Profile {
    kickable:boolean;
    channelManageable:boolean;
}
export interface Quit extends NcIDBase {
    userIDs:string[],
    members:Profile[],
    deletedChannel:number,
}
export class Join implements NcIDBase {
    public channelID:number;
    public newMember:Profile;
    protected oldUsers:string[];
    constructor(members:Profile[]) {
        this.oldUsers = [];
        this.oldUsers.push(...members.map((v) => v.userid));
    }
    public fetch(newMembers:Profile[]) {
        this.newMember = getFirst(newMembers.filter((v) => this.oldUsers.indexOf(v.userid) < 0));
    }
}
interface IChannelMember {
    memberId:string;
    maskingId:string;
    nickname:string;
    memberProfileImageUrl:string;
    manager:boolean;
    cafeMember:boolean;
    staffCode:number;
    staffName:string;
    status:string;
    updateTime:number;
    role:number;
    kickedable:boolean;
    delegatable:boolean;
    channelManageable:boolean;
}
interface IEventMessage {
    serialNumber:string;
    typeCode:number;
    userId:string;
    contents:string;
    memberCount:number;
    createTime:string;
    updateTime:string;
    extras:string;
    tempId:string;
    readCount:number;
}
  