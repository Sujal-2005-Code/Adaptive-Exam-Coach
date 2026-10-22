require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../database/User');
const Question = require('../database/Question');

const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/aec-vap')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Always start with the landing page at root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/landing.html'));
});
app.get('/landing', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/landing.html'));
});
app.get('/landing.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/landing.html'));
});
app.get('/login', (req, res) => {
    res.redirect('/index.html?login=true');
});
app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.use(express.static(path.join(__dirname, '../frontend'), { index: 'landing.html' }));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'openai/gpt-oss-120b'; // fast and supports JSON schema perfectly

// Helper to fix unescaped backslashes in JSON (e.g. for LaTeX \( \))
function safeJSONParse(str) {
    if (!str || typeof str !== 'string') return null;
    str = str.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    
    const jsonBlocks = [...str.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
    if (jsonBlocks.length > 0) {
        str = jsonBlocks[jsonBlocks.length - 1][1];
    }
    
    str = str.trim();
    
    const tryParse = (jsonStr) => {
        try { return JSON.parse(jsonStr); } 
        catch (e) { 
            try { return JSON.parse(jsonStr.replace(/(?<!\\)\\(?=[^"\\/bfnrtu])/g, '\\\\')); }
            catch (e2) {
                try { return JSON.parse(jsonStr.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t').replace(/(?<!\\)\\(?=[^"\\/bfnrtu])/g, '\\\\')); }
                catch (e3) { return null; }
            }
        }
    };

    let result = tryParse(str);
    if (result !== null) return result;

    const firstBrace = str.indexOf('{');
    const lastBrace = str.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        let res = tryParse(str.substring(firstBrace, lastBrace + 1));
        if (res !== null) return res;
    }
    
    const firstBracket = str.indexOf('[');
    const lastBracket = str.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        let res = tryParse(str.substring(firstBracket, lastBracket + 1));
        if (res !== null) return res;
    }

    const lastOpenBrace = str.lastIndexOf('{');
    if (lastOpenBrace !== -1 && lastBrace !== -1 && lastBrace > lastOpenBrace) {
        let res = tryParse(str.substring(lastOpenBrace, lastBrace + 1));
        if (res !== null) return res;
    }

    console.error("safeJSONParse failed completely");
    return null;
}

// Helper to ensure question objects match Mongoose Schema types
function sanitizeQuestionForDB(q) {
    if (!q) return q;
    if (Array.isArray(q.q)) q.q = q.q.join('\n');
    if (Array.isArray(q.h)) q.h = q.h.join('\n');
    if (Array.isArray(q.e)) q.e = q.e.join('\n');
    
    if (Array.isArray(q.a)) {
        if (q.type === 'sata') {
            q.a = JSON.stringify(q.a);
        } else {
            q.a = String(q.a[0] || "");
        }
    }
    
    if (typeof q.a !== 'string') q.a = String(q.a || "");
    if (typeof q.q !== 'string') q.q = String(q.q || "");
    
    return q;
}
// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        jwt.verify(token, JWT_SECRET, async (err, decodedUser) => {
            if (!err) {
                req.user = await User.findById(decodedUser.userId);
            }
            next();
        });
    } else {
        next();
    }
};

// Auth Routes
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, grade, targetExam } = req.body;
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }
        const user = new User({ username, email, password, grade, targetExam });
        await user.save();
        const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, username: user.username, xp: user.xp, streak: user.streak, badges: user.badges, customSyllabusName: user.customSyllabusName, customSyllabusData: user.customSyllabusData });
    } catch (error) {
        res.status(500).json({ error: "Login failed" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });
        
        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, username: user.username, customSyllabusName: user.customSyllabusName, customSyllabusData: user.customSyllabusData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Protected Data Routes
app.get('/api/data', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            weaknessTracker: user.weaknessTracker,
            microTracker: user.microTracker,
            quizHistory: user.quizHistory,
            xp: user.xp,
            streak: user.streak,
            lastActive: user.lastActive,
            badges: user.badges,
            grade: user.grade,
            targetExam: user.targetExam,
            email: user.email,
            customSyllabusName: user.customSyllabusName,
            customSyllabusData: user.customSyllabusData
        });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

app.post('/api/data', authenticateToken, async (req, res) => {
    try {
        const { weaknessTracker, microTracker, quizHistory, xp, streak, lastActive, badges } = req.body;
        await User.findByIdAndUpdate(req.user.userId, {
            weaknessTracker, microTracker, quizHistory, xp, streak, lastActive, badges
        }, { returnDocument: 'after' });
        res.json({ success: true });
    } catch (error) {
        console.error("Error saving data:", error);
        res.status(500).json({ error: "Failed to save data" });
    }
});

app.post('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { grade, targetExam } = req.body;
        await User.findByIdAndUpdate(req.user.userId, {
            grade, targetExam
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Error saving profile:", error);
        res.status(500).json({ error: "Failed to save profile" });
    }
});

app.post('/api/profile/syllabus', authenticateToken, upload.single('syllabus'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const file = req.file;
        let extractedText = "";

        if (file.mimetype === 'application/pdf') {
            const parser = new PDFParse(new Uint8Array(file.buffer));
            const data = await parser.getText();
            extractedText = data.text;
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const data = await mammoth.extractRawText({ buffer: file.buffer });
            extractedText = data.value;
        } else if (file.mimetype.startsWith('image/')) {
            const { data: { text } } = await Tesseract.recognize(
                file.buffer,
                'eng'
            );
            extractedText = text;
        } else {
            return res.status(400).json({ error: "Unsupported file type. Please upload PDF, DOCX, PNG, or JPEG." });
        }

        if (!extractedText.trim()) {
            return res.status(400).json({ error: "Could not extract any text from the document." });
        }

        // The vision model often transcribes the syllabus inside a <think> block and truncates.
        // If we strip the whole block, we lose the text. So just remove the tags themselves.
        extractedText = extractedText.replace(/<think>/gi, '').replace(/<\/think>/gi, '').trim();

        // Extract subjects and topics using Groq
        let customSyllabusData = {};
        try {
            const subjectCompletion = await groq.chat.completions.create({
                messages: [{
                    role: "system",
                    content: "You are a curriculum analyzer. Given the syllabus text, extract the subjects and their respective subtopics (units/chapters). Return ONLY a valid JSON object mapping subjects to arrays of subtopics. Example: {\"Physics\": [\"Kinematics\", \"Dynamics\"], \"Math\": [\"Algebra\", \"Calculus\"]}. If the syllabus is a single course without distinct subjects, return a single key like \"Course Topics\" mapping to the topics.\n\nCRITICAL INSTRUCTION: DO NOT output or regurgitate the syllabus text. DO NOT include any conversational filler. Your entire response MUST be the JSON object and nothing else."
                }, {
                    role: "user",
                    content: extractedText.substring(0, 30000)
                }],
                model: MODEL,
                temperature: 0.1
            });
            const rawResponse = subjectCompletion.choices[0]?.message?.content || "{}";
            customSyllabusData = safeJSONParse(rawResponse) || {};
            if (typeof customSyllabusData !== 'object' || Array.isArray(customSyllabusData) || customSyllabusData === null) {
                customSyllabusData = {};
            }
        } catch (subErr) {
            console.error("Failed to extract subjects:", subErr);
            customSyllabusData = {}; // Fallback
        }

        await User.findByIdAndUpdate(req.user.userId, {
            customSyllabusName: file.originalname,
            customSyllabusText: extractedText.trim(),
            customSyllabusData: customSyllabusData
        });

        res.json({ success: true, syllabusName: file.originalname, customSyllabusData: customSyllabusData });
    } catch (error) {
        console.error("Error processing syllabus:", error);
        res.status(500).json({ error: "Failed to process syllabus" });
    }
});

app.post('/api/quiz/single', optionalAuth, async (req, res) => {
    try {
        const { topic, subtopic, difficulty, format } = req.body;
        
        let qType = 'mcq';
        if (format && format !== 'mix') {
            qType = format;
        } else {
            const r = Math.random();
            if (r > 0.5 && r <= 0.7) qType = 'tf';
            else if (r > 0.7 && r <= 0.9) qType = 'sata';
            else if (r > 0.9) qType = 'short';
        }

        let formatInstructions = '';
        if (qType === 'mcq') {
            formatInstructions = `
  "type": "mcq",
  "q": "String (the question text)",
  "o": ["String", "String", "String", "String"] (exactly 4 options),
  "a": "String (the exact text of the correct option from the 'o' array)",`;
        } else if (qType === 'tf') {
            formatInstructions = `
  "type": "tf",
  "q": "String (the true/false question statement)",
  "o": ["True", "False"],
  "a": "String ('True' or 'False')",`;
        } else if (qType === 'sata') {
            formatInstructions = `
  "type": "sata",
  "q": "String (the question text)",
  "o": ["String", "String", "String", "String"],
  "a": ["String", "String"],`;
        } else if (qType === 'short') {
            formatInstructions = `
  "type": "short",
  "q": "String (a question requiring a short text answer)",
  "o": [],
  "a": "String (The ideal short answer or keyword expected)",`;
        } else {
            formatInstructions = `
  "type": "mcq",
  "q": "String (the question text)",
  "o": ["String", "String", "String", "String"] (exactly 4 options),
  "a": "String (the exact text of the correct option. MUST be a string, NOT an array)",`;
        }

        let syllabusInstruction = '';
        if (req.user && req.user.customSyllabusText) {
            syllabusInstruction = `\nIMPORTANT: The user has a custom syllabus. Ensure the question STRICTLY aligns with the topics mentioned in this syllabus text: """${req.user.customSyllabusText}"""`;
        }

        const prompt = `You are an expert quiz generator. Generate exactly 1 question.
Focus strictly on this subtopic: ${subtopic} (within the broader field of ${topic}).
The difficulty MUST be: ${difficulty}.${syllabusInstruction}
The response MUST be a pure JSON object. Do NOT include markdown code blocks or any other text before or after the JSON.
IMPORTANT: Ensure all backslashes are properly escaped for JSON (e.g., if you use LaTeX, write \\\\( instead of \\(, and \\\\frac instead of \\frac).
The object strictly must have this structure:
{
  "topic": "${topic}",
  "subtopic": "${subtopic}",
  "d": "${difficulty}",${formatInstructions}
  "h": "String (a subtle hint that nudges the student toward the correct answer without directly revealing it)",
  "e": "String (a brief explanation of the correct answer)"
}`;

        let q = null;
        let attempts = 0;
        
        while (attempts < 3 && !q) {
            attempts++;
            try {
                const chatCompletion = await groq.chat.completions.create({
                    messages: [{ role: 'user', content: prompt }],
                    model: MODEL,
                    temperature: 0.7,
                    max_tokens: 1024
                });

                const content = chatCompletion.choices[0]?.message?.content || "{}";
                q = safeJSONParse(content);
                if (!q || !q.q || !q.a) {
                    q = null;
                    throw new Error("Missing required fields");
                }
                
                // Save to DB
                sanitizeQuestionForDB(q);
                const newQ = new Question(q);
                await newQ.save().catch(err => console.error("Failed to save to DB:", err));
                
            } catch (e) {
                console.error(`Attempt ${attempts} failed for single quiz:`, e.message);
            }
        }
        
        if (!q) {
            // Fallback to DB
            const fallbackQuery = { topic, type: qType };
            if (subtopic) fallbackQuery.subtopic = subtopic;
            if (difficulty) fallbackQuery.d = difficulty;
            
            const fallbacks = await Question.aggregate([{ $match: fallbackQuery }, { $sample: { size: 1 } }]);
            if (fallbacks && fallbacks.length > 0) {
                q = fallbacks[0];
                console.log("Using DB fallback for single quiz.");
            } else {
                return res.status(500).json({ error: "AI returned malformed JSON and no DB fallback available." });
            }
        }

        res.json(q);
    } catch (error) {
        console.error("Error generating single quiz:", error);
        res.status(500).json({ error: error.message || "Failed to generate quiz", details: error });
    }
});

app.post('/api/quiz', optionalAuth, async (req, res) => {
    try {
        const { topicsToFocus, difficulty } = req.body;
        
        let syllabusInstruction = '';
        if (req.user && req.user.customSyllabusText) {
            syllabusInstruction = `\nIMPORTANT: The user has a custom syllabus. Ensure the questions STRICTLY align with the topics mentioned in this syllabus text: """${req.user.customSyllabusText}"""`;
        }

        const prompt = `You are an expert quiz generator. Generate exactly 5 multiple choice questions.
Focus predominantly on these topics: ${topicsToFocus.join(", ")}.
If applicable, adjust the general difficulty around: ${difficulty || "mixed"}.${syllabusInstruction}
The response MUST be a pure JSON array of objects. Do NOT include markdown code blocks or any other text before or after the JSON.
IMPORTANT: Ensure all backslashes are properly escaped for JSON (e.g., if you use LaTeX, write \\\\( instead of \\(, and \\\\frac instead of \\frac).
Each object strictly must have this structure:
{
  "topic": "String (e.g., Math, Physics, Chemistry, Biology)",
  "subtopic": "String",
  "type": "mcq",
  "d": "String (easy, medium, or hard)",
  "q": "String (the question text)",
  "o": ["String", "String", "String", "String"] (exactly 4 options),
  "a": "String (the exact text of the correct option. MUST be a string, NOT an array)",
  "e": "String (a brief explanation of the correct answer)"
}`;

        let questions = null;
        let attempts = 0;
        
        while (attempts < 3 && !questions) {
            attempts++;
            try {
                const chatCompletion = await groq.chat.completions.create({
                    messages: [{ role: 'user', content: prompt }],
                    model: MODEL,
                    temperature: 0.7,
                    max_tokens: 2048
                });

                const content = chatCompletion.choices[0]?.message?.content || "[]";
                questions = safeJSONParse(content);
                
                if (!Array.isArray(questions) || questions.length === 0) {
                    questions = null;
                    throw new Error("Invalid array format");
                }
                
                // Save valid questions to DB
                for (const q of questions) {
                    if (q.q && q.a) {
                        if(!q.type) q.type = 'mcq';
                        sanitizeQuestionForDB(q);
                        const newQ = new Question(q);
                        await newQ.save().catch(e => console.error(e));
                    }
                }
                
            } catch (e) {
                console.error(`Attempt ${attempts} failed for batch quiz:`, e.message);
            }
        }
        
        if (!questions) {
            // DB Fallback
            const fallbackQuery = { topic: { $in: topicsToFocus }, type: 'mcq' };
            if (difficulty && difficulty !== 'mixed') fallbackQuery.d = difficulty;
            
            const fallbacks = await Question.aggregate([{ $match: fallbackQuery }, { $sample: { size: 5 } }]);
            if (fallbacks && fallbacks.length > 0) {
                questions = fallbacks;
                console.log("Using DB fallback for batch quiz.");
            } else {
                return res.status(500).json({ error: "AI returned malformed JSON and no DB fallback available." });
            }
        }

        res.json(questions);
    } catch (error) {
        console.error("Error generating quiz:", error);
        res.status(500).json({ error: error.message || "Failed to generate quiz", details: error });
    }
});


app.post('/api/analyze', optionalAuth, async (req, res) => {
    try {
        const { weaknessTracker, quizHistory } = req.body;
        
        let syllabusInstruction = '';
        if (req.user && req.user.customSyllabusText) {
            syllabusInstruction = `\nThe user has uploaded a custom syllabus. Please tailor your study plan and recommendations strictly based on these syllabus topics:\n"""${req.user.customSyllabusText}"""\n`;
        }

        const prompt = `You are an AI study coach analyzing a student's performance.${syllabusInstruction}
Here is the user's weakness tracker (correct/total per topic):
${JSON.stringify(weaknessTracker)}

Here is the user's recent quiz history (up to last 5 quizzes):
${JSON.stringify(quizHistory)}

Provide a personalized, encouraging analysis (around 150-200 words).
Highlight their strengths, pinpoint their weaknesses, and suggest specific study strategies for their weakest topics.
Return the response formatted in simple HTML (using <h3>, <p>, <ul>, <li>, <b>) so it can be directly injected into a web page.
Do NOT wrap the response in markdown blocks like \`\`\`html. Just return the raw HTML.`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: MODEL,
            temperature: 0.6,
        });

        let analysisHTML = chatCompletion.choices[0]?.message?.content || "<p>Analysis failed to generate.</p>";
        analysisHTML = analysisHTML.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        res.send(analysisHTML.replace(/```html/g, '').replace(/```/g, '').trim());
    } catch (error) {
        console.error("Error analyzing performance:", error);
        res.status(500).send("<p>Error generating analysis.</p>");
    }
});

app.post('/api/quiz/evaluate', async (req, res) => {
    try {
        const { question, answer, idealAnswer } = req.body;
        const prompt = `You are an expert tutor. Evaluate if the student's answer is conceptually correct.
Question: ${question}
Ideal Answer: ${idealAnswer}
Student's Answer: ${answer}

Is the student's answer correct? Be lenient with spelling and wording as long as the core concept is right.
Return a pure JSON object. Do NOT include markdown blocks.
{
  "correct": true or false,
  "explanation": "String (A brief explanation of why it is correct or incorrect, referencing their answer.)"
}`;
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: MODEL,
            temperature: 0.1,
            max_tokens: 256
        });
        const aiResponse = chatCompletion.choices[0]?.message?.content || "";
        res.json(safeJSONParse(aiResponse) || { correct: false, explanation: "Error evaluating answer." });
    } catch (error) {
        console.error("Evaluation Error:", error);
        res.status(500).json({ error: "Failed to evaluate answer" });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { chatMessages, image, weaknessTracker, microTracker, quizHistory, isQuizActive, currentQuestion } = req.body;
        
        let contextBlock = `The user is currently studying.
Broad Topic Tracker: ${JSON.stringify(weaknessTracker)}
Detailed Micro-Topic Tracker: ${JSON.stringify(microTracker)}
Recent Quiz History: ${JSON.stringify(quizHistory)}`;

        if (isQuizActive && currentQuestion) {
            contextBlock += `\n\nCRITICAL CONTEXT: The user is currently taking a quiz. They are looking at this specific question:\n${JSON.stringify(currentQuestion)}\n\nYou must act as a Socratic tutor. If they ask for help or a hint, DO NOT GIVE THE DIRECT ANSWER. Ask them a leading question or provide a conceptual hint to help them solve it themselves.`;
        } else {
            contextBlock += `\n\nYou are acting as a Socratic tutor. If the user asks how to solve a problem, guide them step-by-step rather than just giving the final answer.`;
        }

        const systemPrompt = `You are an AI study coach for an exam preparation app. 
${contextBlock}

CRITICAL RULE 1: If the user asks for the direct answer to a question and isQuizActive is true, REFUSE. Tell them you can only give hints while a quiz is ongoing.
CRITICAL RULE 2: If the user asks you to predict exact exam questions or guarantee marks, REFUSE.
CRITICAL RULE 3: When explaining structures or processes, you MUST generate a Mermaid.js diagram. NEVER use ASCII art. 
- You MUST wrap it in \`\`\`mermaid ... \`\`\`. 
- Use EXACT valid syntax: for labeled arrows, use quotes and hyphens like this: \`A -- "label" --> B\`.
- Keep diagrams SIMPLE. ONLY use basic nodes and arrows (e.g., \`A[Name] --> B[Name]\`). Do NOT use notes, subgraphs, styling, or classes.
CRITICAL RULE 4: If the user asks for a realistic picture, factual diagram, or photograph (e.g. "show me a picture of a cell"), DO NOT use Mermaid and DO NOT try to generate a fake image. Instead, output EXACTLY this tag: \`[WIKI_IMAGE: Exact Wikipedia Article Title]\`. For example, \`[WIKI_IMAGE: Plant cell]\` or \`[WIKI_IMAGE: Human digestive system]\`. VERY IMPORTANT: Use the precise, standard Wikipedia article title. Use lowercase for words after the first word (unless it's a proper noun) to prevent bad redirects. The frontend will automatically fetch the real image from Wikipedia and display it.
CRITICAL RULE 5: DO NOT output your internal thought process, step-by-step analysis, or self-correction monologue. ONLY output the final response directed at the user.
Format your responses using Markdown. Keep text concise (under 100 words, excluding diagrams or images).`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...(chatMessages || [])
        ];

        let currentModel = MODEL;
        if (image) {
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                    const originalText = messages[i].content;
                    messages[i].content = [
                        { type: "text", text: originalText || "What is in this image?" },
                        { type: "image_url", image_url: { url: image } }
                    ];
                    break;
                }
            }
            currentModel = 'qwen/qwen3.6-27b';
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: currentModel,
            temperature: 0.7,
        });

        let reply = chatCompletion.choices[0]?.message?.content || "I'm having trouble thinking right now.";
        reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        res.json({ reply });
    } catch (error) {
        console.error("Error in chat:", error);
        res.status(500).json({ error: "Failed to get chat response" });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// ================= MULTIPLAYER ARENA LOGIC =================

const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected to Arena:', socket.id);

    socket.on('create-room', () => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
        rooms[roomId] = {
            id: roomId,
            players: [{ id: socket.id, score: 0, progress: 0 }],
            state: 'waiting',
            questions: []
        };
        socket.join(roomId);
        socket.emit('room-created', roomId);
    });

    socket.on('join-room', async (roomId) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('room-error', 'Room not found.');
            return;
        }
        if (room.players.length >= 2) {
            socket.emit('room-error', 'Room is full.');
            return;
        }
        if (room.state !== 'waiting') {
            socket.emit('room-error', 'Game already started.');
            return;
        }

        room.players.push({ id: socket.id, score: 0, progress: 0 });
        socket.join(roomId);
        
        io.to(roomId).emit('player-joined', room.players.length);

        if (room.players.length === 2) {
            room.state = 'generating';
            io.to(roomId).emit('game-generating');
            
            try {
                const prompt = `You are an expert quiz generator. Generate exactly 5 multiple choice questions for a quick multiplayer trivia battle.
Pick a random science or math topic suitable for high school students.
The response MUST be a pure JSON array of objects. Do NOT include markdown code blocks.
IMPORTANT: Ensure all backslashes are properly escaped for JSON (e.g., if you use LaTeX, write \\\\( instead of \\(, and \\\\frac instead of \\frac).
Each object strictly must have this structure:
{
  "topic": "String",
  "d": "medium",
  "q": "String (the question text)",
  "o": ["String", "String", "String", "String"] (exactly 4 options),
  "a": "String (the exact text of the correct option)"
}`;
                
                let questions = null;
                let attempts = 0;
                
                while (attempts < 3 && !questions) {
                    attempts++;
                    try {
                        const chatCompletion = await groq.chat.completions.create({
                            messages: [{ role: 'user', content: prompt }],
                            model: MODEL,
                            temperature: 0.7,
                            max_tokens: 2048
                        });
                        
                        const content = chatCompletion.choices[0]?.message?.content || "[]";
                        questions = safeJSONParse(content);
                        if (!Array.isArray(questions) || questions.length !== 5) {
                            questions = null;
                            throw new Error("Invalid arena JSON");
                        }
                        
                        for (const q of questions) {
                            if (q.q && q.a) {
                                if(!q.type) q.type = 'mcq';
                                sanitizeQuestionForDB(q);
                                const newQ = new Question(q);
                                await newQ.save().catch(e => console.error(e));
                            }
                        }
                    } catch (e) {
                        console.error(`Attempt ${attempts} failed for arena:`, e.message);
                    }
                }
                
                if (!questions) {
                    // DB Fallback
                    const fallbacks = await Question.aggregate([{ $match: { type: 'mcq' } }, { $sample: { size: 5 } }]);
                    if (fallbacks && fallbacks.length === 5) {
                        questions = fallbacks;
                        console.log("Using DB fallback for arena.");
                    }
                }
                
                if (questions && questions.length === 5) {
                    room.questions = questions;
                    room.state = 'playing';
                    io.to(roomId).emit('game-start', questions);
                } else {
                    throw new Error("Failed to generate or fetch enough questions.");
                }
            } catch (err) {
                console.error('Arena generation failed:', err);
                io.to(roomId).emit('room-error', 'Failed to generate battle questions. Please try again.');
                delete rooms[roomId];
            }
        }
    });

    socket.on('submit-answer', ({ roomId, qIndex, isCorrect }) => {
        const room = rooms[roomId];
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            if (isCorrect) player.score += 10;
            player.progress = qIndex + 1;
            
            io.to(roomId).emit('score-update', {
                players: room.players.map(p => ({ id: p.id, score: p.score, progress: p.progress }))
            });
        }
    });

    socket.on('leave-room', (roomId) => {
        socket.leave(roomId);
        if (rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('opponent-disconnected');
            }
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.players.find(p => p.id === socket.id)) {
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length === 0) delete rooms[roomId];
                else io.to(roomId).emit('opponent-disconnected');
            }
        }
    });
});
