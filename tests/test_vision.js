require('dotenv').config();
const Groq = require('groq-sdk');
const groq = new Groq({apiKey: process.env.GROQ_API_KEY});
async function run() {
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What is this?" },
                        { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" } }
                    ]
                }
            ],
            model: "qwen/qwen3.6-27b"
        });
        console.log("qwen works:", chatCompletion.choices[0]?.message?.content);
    } catch (err) {
        console.error("qwen error:", err.message);
    }
    
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What is this?" },
                        { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" } }
                    ]
                }
            ],
            model: "openai/gpt-oss-120b"
        });
        console.log("gpt-oss works:", chatCompletion.choices[0]?.message?.content);
    } catch (err) {
        console.error("gpt-oss error:", err.message);
    }
}
run();
