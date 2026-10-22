require('dotenv').config();
const fs = require('fs');

async function test() {
    const groq = require('groq-sdk');
    const groqClient = new groq({ apiKey: process.env.GROQ_API_KEY });
    
    let extractedText = "Data Structures and Algorithms\n1. Introduction to Data Structures\n2. Sorting and Searching\n3. Graph Algorithms\n\nSoftware Engineering\n1. SDLC\n2. Agile Methodologies";
    
    let customSyllabusSubjects = [];
    try {
        const subjectCompletion = await groqClient.chat.completions.create({
            messages: [{
                role: "system",
                content: "You are a curriculum analyzer. Given the syllabus text, extract the primary subject(s). Return ONLY a JSON array of strings, e.g., [\"Math\", \"Physics\"]. If only one subject is found, return it as a single-element array. Only return valid JSON array without any markdown formatting."
            }, {
                role: "user",
                content: extractedText.substring(0, 8000)
            }],
            model: "openai/gpt-oss-20b",
            temperature: 0.1,
        });
        
        console.log("Raw Response:");
        console.log(subjectCompletion.choices[0]?.message?.content);
        
        const rawResponse = subjectCompletion.choices[0]?.message?.content || "[]";
        const jsonStr = rawResponse.replace(/`json/g, '').replace(/`/g, '').trim();
        customSyllabusSubjects = JSON.parse(jsonStr);
        console.log("Parsed JSON:");
        console.log(customSyllabusSubjects);
    } catch(err) {
        console.error("Error:", err.message);
    }
}
test();
