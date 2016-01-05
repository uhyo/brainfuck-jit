"use strict";

//ファイル読み込み用のライブラリ
const fs=require('fs');

//コマンドライン引数で与えられたファイルを読み込む
const file = fs.readFileSync(process.argv[2]); //fileにはBufferオブジェクトが入る

interpret(file);

process.exit(0);

function interpret(text){
    //バイトコードを実行

    //メモリ
    const memory = initMemory();
    //プログラムカウンタ
    let pc = 0;
    //メモリポインタ
    let memptr = 0;
    //プログラムの長さ
    const text_length = text.length;

    //ジャンプ先テーブル
    const jmp_table = new Map();

    //入力はバッファされる
    let input_buf="";
    process.stdin.on("data",(chunk)=>{ input_buf += chunk; });

    while(pc < text_length){
        let instruction = text[pc];
        switch(instruction){
            case 0x2b: //'+'
                memory[memptr]++;
                pc++;
                break;
            case 0x2d: //'-'
                memory[memptr]--;
                pc++;
                break;
            case 0x3c: //'<'
                memptr--;
                pc++;
                break;
            case 0x3e: //'>'
                memptr++;
                pc++;
                break;
            case 0x2e: //'.'
                process.stdout.write(String.fromCharCode(memory[memptr]));
                pc++;
                break;
            case 0x2c: //','
                /* super-tenukiな実装 */
                if(input_buf.length===0){
                    throw new Error("No Input");
                }else{
                    memory[memptr] = input_buf.charCodeAt(0);
                    input_buf = input_buf.slice(1);
                }
                pc++;
                break;
            case 0x5b: //'['
                if(memory[memptr]===0){
                    //対応する]まで飛ぶ
                    if(jmp_table.has(pc)){
                        //キャッシュがあった
                        pc = jmp_table.get(pc)+1;
                    }else{
                        //ないので探す
                        let close = getLoopEnd(text, text_length, pc+1);
                        jmp_table.set(pc, close);
                        jmp_table.set(close, pc);
                        pc = close+1;
                    }
                }else{
                    pc++;
                }
                break;
            case 0x5d: //']'
                if(memory[memptr]===0){
                    pc++;
                }else{
                    //対応する[まで飛ぶ
                    if(jmp_table.has(pc)){
                        pc = jmp_table.get(pc)+1;
                    }else{
                        let start = getLoopStart(text, pc-1);
                        jmp_table.set(pc, start);
                        jmp_table.set(start, pc);
                        pc = start+1;
                    }
                }
                break;
            default:
                pc++;
        }
    }
}


//メモリを初期化
function initMemory(){
    //全部0にする
    const result = [];
    for(let i=0;i<30000;i++){
        result[i]=0;
    }
    return result;
}

//[に対応する]を探す
function getLoopEnd(text, text_length, pc){
    let depth=0;
    while(pc < text_length){
        let i = text[pc];
        if(i===0x5b){
            // '['
            depth++;
        }else if(i===0x5d){
            // ']'
            if(depth===0){
                return pc;
            }else{
                depth--;
            }
        }
        pc++;
    }
    throw new Error("Cound not find ]");
}
//]に対応する[を探す
function getLoopStart(text, pc){
    let depth=0;
    while(pc >= 0){
        let i = text[pc];
        if(i===0x5b){
            // '['
            if(depth===0){
                return pc;
            }else{
                depth--;
            }
        }else if(i===0x5d){
            // ']'
            depth++;
        }
        pc--
    }
    throw new Error("Cound not find [");
}
