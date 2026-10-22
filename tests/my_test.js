require('dotenv').config();
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
groq.chat.completions.create({
    messages: [
        { role: 'system', content: 'Return ONLY a valid JSON object mapping subjects to arrays of subtopics. Example: {"Physics": ["Kinematics"]}.' },
        { role: 'user', content: 'University Curriculum\n1. Science\n - Physics' }
    ],
    model: 'qwen/qwen3.6-27b',
    temperature: 0.1
}).then(res => {
    console.log('RESPONSE:', res.choices[0].message.content);
}).catch(console.error);
