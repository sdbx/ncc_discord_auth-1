import * as get from "get-value";
import Session, { Message } from "node-ncc-es6";
import * as io from "socket.io-client";
import Cache from "../cache";
import Log from "../log";
import NCredit from "./credit/ncredit";
import { CHAT_API_URL, CHAT_APIS, CHAT_BACKEND_URL, CHAT_HOME_URL, CHAT_SOCKET_IO, COOKIE_SITES } from "./ncconstant";
import { asJSON, parseURL } from "./nccutil";
import NcFetch from "./ncfetch";
import NcCredent from "./ncredent";
import NcBaseChannel from "./talk/ncbasechannel";
import NcChannel from "./talk/ncchannel";

export default class Ncc extends NcFetch {
    protected session:Session;
    constructor() {
        super();
    }
    /**
     * Fetch current channels
     */
    public async fetchChannels() {
        const content = asJSON(await this.credit.reqGet(`${CHAT_API_URL}/${CHAT_APIS.CHANNEL}?onlyVisible=true`));
        const channels = (get(content, "message.result.channelList") as object[])
            .map((channel) => new NcBaseChannel(channel));
        return channels;
    }
    public async connect(channel:number | NcBaseChannel) {
        if (typeof channel !== "number") {
            channel = channel.channelId;
        }
        const detail = await NcChannel.from(this.credit, channel);
        await detail.connect(this.credit);
    }

    public async getRoom(roomID:string) {
        if (await this.availableAsync()) {
            const rooms = (await this.chat.getRoomList()).filter((_v) => _v.id === roomID);
            for (const _room of rooms) {
                return _room;
            }
        }
        return null;
    }
    public async deleteRoom(roomID:string) {
        const room = await this.getRoom(roomID);
        if (room != null) {
            await this.chat.deleteRoom(room);
        }
        return Promise.resolve();
    }
    protected async onLogin(username:string):Promise<void> {
        super.onLogin(username);
        /*
        this.session = new Session(this.credit);
        await this.session.connect();
        await this.chat.getRoomList();
        this.chat.on("message",this.onNccMessage.bind(this));
        */
        return Promise.resolve();
    }
    protected async onNccMessage(message:Message) {
        this.emit("message",message);
    }
    /**
     * get session
     */
    public get chat():Session {
        return this.session;
    }
}