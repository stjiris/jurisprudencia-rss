import { Client } from "@elastic/elasticsearch";
import { ScrollSearchResponse } from "@elastic/elasticsearch/lib/helpers";
import { JurisprudenciaDocument, JurisprudenciaVersion } from "@stjiris/jurisprudencia-document";
import { Feed } from "feed";
import { writeFile } from "fs/promises";
import path from "path";

const client = new Client({ node: process.env.ES_URL || "http://localhost:9200", auth: { username: "elastic", password: "elasticsearch" } })
const publicLink = process.env.RSS_LINK || "http://localhost:3000/jurisprudencia"

function isAreaInFeed(map: Map<string, Feed>, area: string | undefined) {
    for (let feedArea of map.keys()) {
        if (feedArea === area) {
            return true;
        }
    }
    // If no match is found, return false
    return false;
}


async function main() {
    const feed = new Feed({
        title: 'RSS Jurisprudência - Geral',
        id: publicLink,
        link: publicLink,
        description: 'Latest updates from Your Website',
        copyright: 'Supremo Tribunal da Justiça, 2024'
    });

    let p = client.helpers.scrollDocuments<JurisprudenciaDocument>({
        index: JurisprudenciaVersion,
        //_source: ["Número de Processo", "Relator Nome Profissional", "Data"],
        sort: {
            Data: "desc"
        }
    })

    let counter = 0
    const feeds = new Map();
    feeds.set("Geral", feed);
    
    for await (const acordao of p){
        counter++
        
        let [dd,mm,yyyy] = acordao.Data?.split("/") || "01/01/1900".split("/")
        let data = new Date(parseInt(yyyy),parseInt(mm) - 1,parseInt(dd),12)
        let id = acordao.ECLI?.startsWith("ECLI:PT:STJ:") ? `/ecli/${acordao.ECLI}` : `/${encodeURIComponent(acordao["Número de Processo"]!)}/${acordao.UUID}`
        
        const descritoresArray = (String) (acordao.Descritores?.Show).split(",");
        const descritoresFormatados = descritoresArray.join(" / ");
        const meioProcessualArray = (String) (acordao["Meio Processual"]?.Show).split(",");
        let meioProcessualFormatado;
        
        if (meioProcessualArray.length > 1) {
            meioProcessualFormatado = meioProcessualArray.join("/");
        } 
        else {
            meioProcessualFormatado = acordao["Meio Processual"]?.Show;
        }
        
        // Adiciona para RSS geral
        feed.addItem({
            title: acordao["Número de Processo"] || "Número de Processo não encontrado",
            id: id,
            link: publicLink + id,
            content: acordao.Área?.Show + " - " + meioProcessualFormatado + " - " + acordao["Relator Nome Profissional"]?.Show + " - " + acordao.Secção?.Show + "<br>" +
                    "Votação: " + acordao.Votação?.Show +  "&nbsp; &nbsp; &nbsp;" + "Decisão: " + acordao.Decisão?.Show + "<br>" +
                    "Descritores: " + descritoresFormatados + "<br> <br>" + 
                    "Sumário: " + acordao.Sumário || "Sumário não encontrado",
            date: data 
        });

        if(!isAreaInFeed(feeds, acordao.Área?.Show[0])){
            const newFeed = new Feed({
                title: 'RSS Jurisprudência - ' + acordao.Área?.Show,
                id: publicLink,
                link: publicLink,
                description: 'Latest updates from Your Website',
                copyright: 'Supremo Tribunal da Justiça, 2024'
            });
            feeds.set(acordao.Área?.Show[0], newFeed)
        }

        // Adiciona para RSS da sua área
        feeds.get(acordao.Área?.Show[0]).addItem({
            title: acordao["Número de Processo"] || "Número de Processo não encontrado",
            id: id,
            link: publicLink + id,
            content: acordao.Área?.Show + " - " + meioProcessualFormatado + " - " + acordao["Relator Nome Profissional"]?.Show + " - " + acordao.Secção?.Show + "<br>" +
                    "Votação: " + acordao.Votação?.Show +  "&nbsp; &nbsp; &nbsp;" + "Decisão: " + acordao.Decisão?.Show + "<br>" +
                    "Descritores: " + descritoresFormatados + "<br> <br>" + 
                    "Sumário: " + acordao.Sumário || "Sumário não encontrado",
            date: data 
        });

        
        if(counter >= 1000){
            break;
        }
    }

    feeds.forEach(async (feed,area) => {
        let aggKey = area
        if (aggKey == "Geral"){
            aggKey = "rss"
        }
        const pathToRSS = path.join(process.env.RSS_FOLDER || "", aggKey + ".xml")
        await writeFile(pathToRSS,feed.rss2())
    });
}

main()

