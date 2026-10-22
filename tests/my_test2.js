function safeJSONParse(str) {
    str = str.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    str = str.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    let jsonStr = str;
    const startObj = str.indexOf('{');
    const endObj = str.lastIndexOf('}');
    const startArr = str.indexOf('[');
    const endArr = str.lastIndexOf(']');
    
    let isObj = startObj !== -1 && endObj !== -1 && endObj >= startObj;
    let isArr = startArr !== -1 && endArr !== -1 && endArr >= startArr;
    
    if (isObj && isArr) {
       if (startObj < startArr) isArr = false; else isObj = false;
    }
    
    if (isObj) jsonStr = str.substring(startObj, endObj + 1);
    else if (isArr) jsonStr = str.substring(startArr, endArr + 1);
    
    try { return JSON.parse(jsonStr); } 
    catch (e) { 
        return null;
    }
}
const output = `<think>
some reasoning
</think>
Here is the JSON:
{"Science": ["Physics"]}
`;
console.log(safeJSONParse(output));
