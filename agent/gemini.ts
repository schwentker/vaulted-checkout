// Gemini model layer: Interactions API over plain fetch (no SDK dependency).
// Shapes verified against Google's official docs (2026-10-25):
//   https://ai.google.dev/gemini-api/docs/function-calling  (Interactions REST: function declarations, function_call steps, function_result input)
//   https://ai.google.dev/api/interactions                  (POST /v1beta/interactions, x-goog-api-key, generation_config.thinking_level, previous_interaction_id)
//   https://ai.google.dev/gemini-api/docs/interactions      (tools, system_instruction, generation_config are per interaction: resend each turn)
// The API key goes only in the x-goog-api-key header. It is never logged, echoed, or passed to the adapter.

export type ToolDecl={name:string;description:string;inputSchema:Record<string,unknown>};
export type FunctionCall={id:string;name:string;args:unknown};
export type ModelTurn={calls:FunctionCall[];text:string};
export type ToolResult={call:FunctionCall;result:unknown};
export interface Model {
  start(system:string,task:string,tools:ToolDecl[]):Promise<ModelTurn>;
  reply(results:ToolResult[]):Promise<ModelTurn>;
}

export class GeminiInteractions implements Model {
  #key:string; base:string; model:string; system='';tools:unknown[]=[];previous:string|null=null;
  constructor(env:Record<string,string|undefined>=process.env) {
    if(!env.GEMINI_MODEL) throw new Error('GEMINI_MODEL is required');
    if(!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required');
    this.#key=env.GEMINI_API_KEY;this.model=env.GEMINI_MODEL;
    this.base=(env.GEMINI_BASE_URL??'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/,'');
  }
  async #send(input:unknown):Promise<ModelTurn> {
    const body={model:this.model,input,system_instruction:this.system,tools:this.tools,generation_config:{thinking_level:'medium'},...(this.previous?{previous_interaction_id:this.previous}:{})};
    let res:Response;
    try { res=await fetch(`${this.base}/interactions`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':this.#key},body:JSON.stringify(body),signal:AbortSignal.timeout(300_000)}); }
    catch(e) { throw new Error(`gemini_unreachable ${(e as Error)?.name??''}`.trim()); }
    // Status only: error bodies are not printed.
    if(!res.ok) { await res.body?.cancel().catch(()=>{}); throw new Error(`gemini_http_${res.status}`); }
    const v=await res.json() as any;
    if(typeof v?.id!=='string'||!Array.isArray(v?.steps)) throw new Error('gemini_bad_response');
    this.previous=v.id;
    return parseSteps(v.steps);
  }
  start(system:string,task:string,tools:ToolDecl[]) {
    this.system=system;this.previous=null;
    this.tools=tools.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.inputSchema}));
    return this.#send([{type:'user_input',content:[{type:'text',text:task}]}]);
  }
  reply(results:ToolResult[]) {
    return this.#send(results.map(r=>({type:'function_result',name:r.call.name,call_id:r.call.id,result:[{type:'text',text:JSON.stringify(r.result)}]})));
  }
}

export function parseSteps(steps:any[]):ModelTurn {
  const calls:FunctionCall[]=[];const texts:string[]=[];
  for(const s of steps) {
    if(s?.type==='function_call'&&typeof s.name==='string') calls.push({id:String(s.id??''),name:s.name,args:s.arguments??{}});
    else if(typeof s?.text==='string'&&s.type!=='thought') texts.push(s.text);
    else if(s?.type!=='thought'&&Array.isArray(s?.content)) for(const c of s.content) if(c?.type==='text'&&typeof c.text==='string') texts.push(c.text);
  }
  return {calls,text:texts.join('\n').trim()};
}
