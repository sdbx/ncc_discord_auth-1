import * as fs from "fs";
import * as fetcher from "./fetcher";
import Config from "./structure/config";
import XlsxUtil from "./xlsxutil";

class Inner {
    public static main():number {
        console.log("hello world");
        return 0;
    }
}
Inner.main();
fetcher.getComments(26686242,7212);
fetcher.getArticles(26686242);
const cfg:Config = new Config();
cfg.import(true);

// cfg.export();
/*
fetcher.getWeb("http://cafe.naver.com/ArticleList.nhn", {
    'search.clubid':'26686242',
    'search.boardtype':'L'
})*/