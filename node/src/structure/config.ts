import * as fs from "fs-extra";
import { promisify } from "util";
import * as fetcher from "../fetcher";

export default class Config {
    public static readonly appVersion:number = 2;
    public version:number = Config.appVersion;
    public discordID:IDiscordID = {articleChannels:[]} as any;
    public cafe:ICafe = {} as any;
    public game:Game = new Game();
    public discordToken:string = "token";
    public roleName:string = "@everyone";
    public articleCfg:IArticleCfg = {} as any;

    private readonly saveTo:string = "./config/config.json";
    private readonly dirpath:string = this.saveTo.substring(0,this.saveTo.lastIndexOf("/"));
    public constructor() {
        console.log("Hi");
    }
    public async export():Promise<boolean> {
        if (await this.checkDir()) {
            const write:string = JSON.stringify(this,(key:string,value:any) => {
                if (key === "saveTo" || key === "dirpath") {
                    value = "Constant";
                }
                if (key === "version") {
                    value = Config.appVersion.toString();
                }
                return value;
            },"\t");
            const result = await fs.access(this.saveTo,fs.constants.W_OK)
                .catch((err:any) => {
                    if (err.code === "ENOENT") {
                        return;
                    } else {
                        console.log(err.code);
                        throw err;
                    }
                })
                .then(() => fs.writeFile(this.saveTo,write,{encoding:"utf-8"}))
                .then(() => true)
                .catch((err) => {console.log(err); return false;});
            return Promise.resolve(result);
        } else {
            console.error("export - No directory");
            // return Promise.reject("No directory");
            return Promise.resolve(false);
        }
    }
    public async import(createIfNeed:boolean = false):Promise<void> {
        const accessible:boolean = await fs.stat(this.saveTo)
                        .then((stat:fs.Stats) => true)
                        .catch((err:any) => false);
        if (accessible) {
            const text:string = await fs.readFile(this.saveTo,{encoding:"utf-8"});
            const data:any = JSON.parse(text);
            data.saveTo = null;
            data.dirpath = null;
            this.clone(data,this);
            let force:boolean = false;
            if (this.cafe.url.match(/^(http|https):\/\/.*cafe.naver.com\/.*/igm).length >= 1
                && (this.cafe.id <= 0 || this.cafe.article <= 0)) {
                const localCafe:ICafe = await fetcher.parseNaver(this.cafe.url)
                                            .then((cafe:ICafe) => cafe)
                                            .catch((err:any) => this.cafe);
                if (!Number.isNaN(localCafe.id) && localCafe.id > 0) {
                    this.cafe = localCafe;
                    force = true;
                }
            }
            if (data.version < Config.appVersion || force) {
                await this.export();
            }
            // console.log(JSON.stringify(this));
            return Promise.resolve();
        } else {
            console.error("Can't read config file");
            if (createIfNeed) {
                const result:boolean = await this.export();
                if (!result) {
                    return Promise.reject("Can't access directory");
                }
            }
            return Promise.resolve();
        }
    }
    private async checkDir():Promise<boolean> {
        return await fs.access(this.dirpath,fs.constants.R_OK | fs.constants.W_OK)
            .then(() => Promise.resolve(true))
            .catch((err) => fs.mkdir(this.dirpath))
            .then(() => Promise.resolve(true))
            .catch((err) => Promise.resolve(false));
    }
    private clone(obj:any,toObject:any = null):any {
        if (obj === null || typeof(obj) !== "object") {
            return obj;
        }
        let copy:any;
        if (toObject == null) {
            copy = obj.constructor();
        } else {
            copy = toObject;
        }
        // const copy:any = obj.constructor();
        for (const attr in obj) {
          if (obj.hasOwnProperty(attr)) {
              const value:any = this.clone(obj[attr],toObject[attr]);
              if (value != null) {
                  try {
                    copy[attr] = value;
                  } catch (err) {
                      console.log(err);
                  }
              }
          }
        }
        return copy;
    }
}
export interface IDiscordID {
    room:number;
    botChannel:number;
    welcomeChannel:number; // discordMainChID
    articleChannels:number[];
}
export interface IMessage {
    welcome:string;
    authed:string;
}
export interface ICafe {
    url:string;
    id:number;
    article:number;
}
export class Game {
    public static readonly Playing:string = "playing";
    public static readonly Watching:string = "watching";
    public static readonly Listening:string = "listening";
    public static readonly Streaming:string = "streaming";
    public name:string;
    public type:string;
    constructor(input:{name:string,type:string}= {name:"Bots",type:"Playing"}) {
        this.name = input.name;
        this.type = input.type;
    }
    public getID(type:string):number {
        const order:string[] = [Game.Playing,Game.Watching,Game.Listening,Game.Streaming];
        let out:number = 0;
        for (let i = 0;i < order.length;i += 1) {
            if (order[i].toLowerCase() === type.toLowerCase()) {
                out = i;
                break;
            }
        }
        return out;
    }
}
export interface IArticleCfg {
    enableAlert:boolean;
    updateSec:number;
}