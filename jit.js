"use strict";

const JIT_OP_DATA = 0;
const JIT_OP_IN   = 1;
const JIT_OP_OUT  = 2;

//ファイル読み込み用のライブラリ
const fs=require('fs');

//コマンドライン引数で与えられたファイルを読み込む
const file = fs.readFileSync(process.argv[2]); //fileにはBufferオブジェクトが入る

//入力はバッファされる
let input_buf="";
process.stdin.on("data",(chunk)=>{ input_buf += chunk; });

interpret(file);

process.exit(0);

function interpret(text){
    //バイトコードを実行

    //メモリ
    const memory = initZeroArray(30000);
    //プログラムカウンタ
    let pc = 0;
    //メモリポインタ
    let memptr = 0;
    //プログラムの長さ
    const text_length = text.length;

    //ジャンプ先テーブル
    const jmp_table = new Map();

    /******************* JIT用の変数宣言 */
    //基本ブロックの呼出回数をカウント
    const call_count = initZeroArray(text_length);
    //コンパイルされた基本ブロックを格納する場所
    const compiled = [];

    //コンパイル作業実行中
    let compile_context = null;

    //基本ブロックの実行中か
    let block_start = false;

    while(pc < text_length){
        let instruction = text[pc];
        /* ↓ここの条件文手抜き */
        if(block_start===true && instruction!==0x5b && instruction!==0x5d){
            //ここが基本ブロックの最初だ
            if(compiled[pc] != null){
                //コンパイル済だ
                let result = compiled[pc](memptr, memory, getchar, putchar);
                /*pc = result[0];
                memptr = result[1];*/
                pc = result.pc;
                memptr = result.memptr;
                block_start = false;
                continue;
            }else{
                if(++call_count[pc] === 5){
                    //5回呼ばれたらコンパイル開始
                    compile_context = {
                        //ブロック開始位置
                        pc,
                        //操作の列
                        ops: []
                    };
                }
            }
        }
        switch(instruction){
            case 0x2b: //'+'
                memory[memptr]++;
                pc++;
                block_start=false;
                if(compile_context!=null){
                    //コンパイル中なのでメモリ操作の情報を記録
                    jit_plus(compile_context, 1);
                }
                break;
            case 0x2d: //'-'
                memory[memptr]--;
                pc++;
                block_start=false;
                if(compile_context!=null){
                    jit_plus(compile_context, -1);
                }
                break;
            case 0x3c: //'<'
                memptr--;
                pc++;
                block_start=false;
                if(compile_context!=null){
                    jit_ptrplus(compile_context, -1);
                }
                break;
            case 0x3e: //'>'
                memptr++;
                pc++;
                block_start=false;
                if(compile_context!=null){
                    jit_ptrplus(compile_context, 1);
                }
                break;
            case 0x2e: //'.'
                putchar(memory[memptr]);
                pc++;
                block_start=false;
                if(compile_context!=null){
                    jit_out(compile_context);
                }
                break;
            case 0x2c: //','
                /* super-tenukiな実装 */
                memory[memptr] = getchar();
                pc++;
                block_start=false;
                if(compile_context!=null){
                    jit_in(compile_context);
                }
                break;
            case 0x5b: //'['
                if(compile_context != null){
                    //基本ブロックの終わりに到達した
                    jit_compiler(compile_context, pc, compiled);
                    compile_context=null;
                }
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
                block_start=true;
                break;
            case 0x5d: //']'
                if(compile_context != null){
                    jit_compiler(compile_context, pc, compiled);
                    compile_context=null;
                }
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
                block_start=true;
                break;
            default:
                pc++;
        }
    }
}


//0初期化された配列を返す
function initZeroArray(length){
    //全部0にする
    const result = [];
    for(let i=0;i<length;i++){
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

//1文字出力
function putchar(charcode){
    process.stdout.write(String.fromCharCode(charcode));
}
//1文字入力
function getchar(){
    /* super-tenukiな実装 */
    if(input_buf.length===0){
        throw new Error("No Input");
    }else{
        let result = input_buf.charCodeAt(0);
        input_buf = input_buf.slice(1);
        return result;
    }
}

//JIT用関数：命令を記録
function jit_plus(compile_context, d){
    let ops = compile_context.ops;
    let last_op = ops[ops.length-1];
    if(last_op==null || last_op.type!==JIT_OP_DATA){
        last_op = {
            type: JIT_OP_DATA,
            memory: {},
            memptr: 0
        };
        ops.push(last_op);
    }
    let memptr = last_op.memptr;
    let c = last_op.memory[memptr] || 0;
    last_op.memory[memptr] = c+d;
}
function jit_ptrplus(compile_context, d){
    let ops = compile_context.ops;
    let last_op = ops[ops.length-1];
    if(last_op==null || last_op.type!==JIT_OP_DATA){
        last_op = {
            type: JIT_OP_DATA,
            memory: {},
            memptr: 0
        };
        ops.push(last_op);
    }
    last_op.memptr += d;
}
function jit_out(compile_context, d){
    compile_context.ops.push({
        type: JIT_OP_OUT
    });
}
function jit_in(compile_context, d){
    compile_context.ops.push({
        type: JIT_OP_IN
    });
}

function jit_compiler(compile_context, next_pc, compiled){
    //収集した情報からJavaScriptネイティブコードを生成
    if(next_pc - compile_context.pc < 5){
        //短すぎると効果が薄いのでやめる
        return;
    }
    let code='"use strict";';
    const ops=compile_context.ops;
    const l=ops.length;
    for(let i=0;i<l;i++){
        let op=ops[i];
        switch(op.type){
            case JIT_OP_DATA:
                //メモリなどの操作
                let mm=op.memory;
                for(let j in op.memory){
                    if(mm[j]){
                        code+="memory[memptr+("+j+")]+="+mm[j]+";";
                    }
                }
                if(op.memptr!==0){
                    code+="memptr+="+op.memptr+";";
                }
                break;
            case JIT_OP_IN:
                code+="memory[memptr]=getchar();";
                break;
            case JIT_OP_OUT:
                code+="putchar(memory[memptr]);";
                break;
        }
    }
    //結果を返す処理
    //code+="return ["+next_pc+",memptr];";
    code+="return {pc:"+next_pc+", memptr};";
    //console.log(code);
    //登録
    compiled[compile_context.pc] = new Function("memptr","memory","getchar","putchar",code);
}
