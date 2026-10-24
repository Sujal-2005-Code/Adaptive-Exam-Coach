require('dotenv').config();
const dns = require('dns');
try {
    // Resolve MongoDB SRV lookups reliably across Windows network adapters
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
    console.warn('DNS setServers warning:', e.message);
}

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

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/aec-vap', {
    serverSelectionTimeoutMS: 10000
})
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

// Helper to fix unescaped backslashes, comments, trailing commas, and control chars in JSON
function safeJSONParse(str) {
    if (!str || typeof str !== 'string') return null;
    str = str.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    
    const jsonBlocks = [...str.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
    if (jsonBlocks.length > 0) {
        str = jsonBlocks[jsonBlocks.length - 1][1];
    }
    
    str = str.trim();

    const cleanJSON = (raw) => {
        if (!raw) return '';
        return raw
            // Remove single-line JS comments
            .replace(/\/\/.*$/gm, '')
            // Remove trailing commas before } or ]
            .replace(/,\s*([}\]])/g, '$1')
            // Fix unescaped backslashes (excluding standard escape chars " \ / b f n r t u)
            .replace(/(?<!\\)\\(?=[^"\\/bfnrtu])/g, '\\\\');
    };
    
    const tryParse = (jsonStr) => {
        if (!jsonStr) return null;
        try { return JSON.parse(jsonStr); } 
        catch (e) { 
            try { return JSON.parse(cleanJSON(jsonStr)); }
            catch (e2) {
                try {
                    // Fix unescaped newlines/tabs inside string literals
                    const sanitized = cleanJSON(jsonStr).replace(/[\u0000-\u001F]+/g, (match) => {
                        if (match.includes('\n')) return '\\n';
                        if (match.includes('\t')) return '\\t';
                        return ' ';
                    });
                    return JSON.parse(sanitized);
                } catch (e3) { return null; }
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

    console.warn("safeJSONParse: unable to parse JSON payload. Preview:", str.substring(0, 150).replace(/\s+/g, ' '));
    return null;
}

// Normalize alternative field names from various LLMs (e.g. question -> q, answer -> a)
function normalizeQuestionFields(q) {
    if (!q || typeof q !== 'object') return q;
    if (!q.q && q.question) q.q = q.question;
    if (!q.a && q.answer) q.a = q.answer;
    if (!q.o && q.options) q.o = q.options;
    if (!q.h && q.hint) q.h = q.hint;
    if (!q.e && q.explanation) q.e = q.explanation;
    if (!q.subtopic && q.sub) q.subtopic = q.sub;
    if (!q.topic && q.subject) q.topic = q.subject;
    return q;
}

// Helper to ensure question objects match Mongoose Schema types
function sanitizeQuestionForDB(q) {
    if (!q) return q;
    normalizeQuestionFields(q);
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
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'Database is still establishing connection. Please try again in 5 seconds.' });
    }
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
        res.status(500).json({ error: "Registration failed: " + error.message });
    }
});

app.post('/api/login', async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'Database is still establishing connection. Please try again in 5 seconds.' });
    }
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

// Reset / Forgot Password Route
app.post('/api/reset-password', async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'Database is still establishing connection. Please try again in 5 seconds.' });
    }
    try {
        const { email, newPassword, confirmPassword } = req.body;
        if (!email || !newPassword) {
            return res.status(400).json({ error: 'Please provide both your registered email address and new password.' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
        }
        if (confirmPassword && newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'New password and confirm password do not match.' });
        }
        
        const cleanEmail = String(email).toLowerCase().trim();
        const user = await User.findOne({ email: cleanEmail });
        if (!user) {
            return res.status(404).json({ error: 'No account registered with this email address.' });
        }
        
        // Triggers UserSchema.pre('save') which hashes with bcrypt
        user.password = newPassword;
        await user.save();
        
        res.json({ success: true, message: 'Password has been updated successfully! You can now log in.' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Failed to reset password: ' + error.message });
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
  "o": ["Option A", "Option B", "Option C", "Option D"],
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
  "o": ["Option A", "Option B", "Option C", "Option D"],
  "a": ["Option A", "Option C"],`;
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
  "o": ["Option A", "Option B", "Option C", "Option D"],
  "a": "String (the exact text of the correct option)",`;
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
                    max_tokens: 3072
                });

                const content = chatCompletion.choices[0]?.message?.content || "{}";
                let parsed = safeJSONParse(content);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    parsed = parsed[0];
                }
                if (parsed && typeof parsed === 'object') {
                    normalizeQuestionFields(parsed);
                }
                q = parsed;
                if (!q || !q.q || !q.a) {
                    q = null;
                    throw new Error("Missing required fields (q or a)");
                }
                
                // Save to DB without mutating in-memory q
                const dbQ = sanitizeQuestionForDB(JSON.parse(JSON.stringify(q)));
                const newQ = new Question(dbQ);
                await newQ.save().catch(err => console.error("Failed to save to DB:", err));
                
            } catch (e) {
                console.warn(`Attempt ${attempts} note for single quiz:`, e.message);
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

        // Ensure SATA format is sent as an array to frontend
        if (q && q.type === 'sata' && typeof q.a === 'string') {
            try {
                const parsedSata = JSON.parse(q.a);
                if (Array.isArray(parsedSata)) q.a = parsedSata;
            } catch (e) {}
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
  "o": ["Option A", "Option B", "Option C", "Option D"],
  "a": "String (the exact text of the correct option)",
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
                    max_tokens: 4096
                });

                const content = chatCompletion.choices[0]?.message?.content || "[]";
                let parsed = safeJSONParse(content);
                if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') {
                    if (Array.isArray(parsed.questions)) parsed = parsed.questions;
                    else if (Array.isArray(parsed.quiz)) parsed = parsed.quiz;
                    else if (Array.isArray(parsed.items)) parsed = parsed.items;
                    else if (parsed.q || parsed.question) parsed = [parsed];
                }
                questions = parsed;
                
                if (!Array.isArray(questions) || questions.length === 0) {
                    questions = null;
                    throw new Error("Invalid array format");
                }
                
                // Save valid questions to DB
                for (const q of questions) {
                    normalizeQuestionFields(q);
                    if (q.q && q.a) {
                        if(!q.type) q.type = 'mcq';
                        sanitizeQuestionForDB(q);
                        const newQ = new Question(q);
                        await newQ.save().catch(e => console.error(e));
                    }
                }
                
            } catch (e) {
                console.warn(`Attempt ${attempts} note for batch quiz:`, e.message);
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
        const cleanA = String(answer || '').trim().toLowerCase();
        const cleanIdeal = String(idealAnswer || '').trim().toLowerCase();
        
        // Fast direct exact/fuzzy match check before calling LLM
        if (cleanA && cleanIdeal) {
            if (cleanA === cleanIdeal || cleanIdeal.includes(cleanA) || cleanA.includes(cleanIdeal)) {
                return res.json({ correct: true, explanation: `Correct! "${idealAnswer}" was the expected answer.` });
            }
        }

        const prompt = `You are an expert tutor. Evaluate if the student's answer is conceptually correct.
Question: ${question}
Ideal Answer: ${idealAnswer}
Student's Answer: ${answer}

Is the student's answer correct? Be lenient with spelling, minor typos, and wording as long as the core concept is right.
Return a pure JSON object. Do NOT include markdown blocks.
{
  "correct": true,
  "explanation": "String (A brief explanation of why it is correct or incorrect, referencing their answer.)"
}`;
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: MODEL,
            temperature: 0.1,
            max_tokens: 256
        });
        const aiResponse = chatCompletion.choices[0]?.message?.content || "";
        const parsed = safeJSONParse(aiResponse) || {};
        const isCorrect = (
            parsed.correct === true || 
            parsed.correct === 'true' || 
            parsed.is_correct === true || 
            parsed.is_correct === 'true'
        );
        res.json({
            correct: isCorrect,
            explanation: parsed.explanation || (isCorrect ? "Correct!" : `The expected answer was: ${idealAnswer}`)
        });
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

// ================= MULTIPLAYER ARENA 2.0 LOGIC =================

const rooms = {};

function getPublicRooms() {
    const list = [];
    for (const id in rooms) {
        const r = rooms[id];
        if (!r.isPrivate && r.state === 'lobby') {
            list.push({
                id: r.id,
                name: r.name,
                hostName: r.players[0]?.username || 'Host',
                subject: r.config.subject,
                subtopic: r.config.subtopic,
                format: r.config.format,
                count: r.config.count,
                timer: r.config.timer,
                playerCount: r.players.length,
                maxPlayers: r.maxPlayers,
                createdAt: r.createdAt
            });
        }
    }
    return list;
}

async function generateArenaQuestions(config) {
    const count = [5, 10, 15].includes(parseInt(config.count)) ? parseInt(config.count) : 5;
    const subject = config.subject || 'All';
    const subtopic = config.subtopic && config.subtopic !== 'All' ? `specifically on subtopic "${config.subtopic}"` : '';
    const format = config.format || 'mix';

    let formatInstruction = '';
    if (format === 'mcq') {
        formatInstruction = `All questions must be single-choice Multiple Choice Questions (type: "mcq") with exactly 4 options in "o" and the exact string answer in "a".`;
    } else if (format === 'tf') {
        formatInstruction = `All questions must be True/False questions (type: "tf") with "o": ["True", "False"] and "a": "True" or "False".`;
    } else if (format === 'sata') {
        formatInstruction = `All questions must be Select All That Apply (type: "sata") with 4 options in "o" and an array of 2 or more correct options in "a".`;
    } else if (format === 'short') {
        formatInstruction = `All questions must be Short Answer (type: "short") with "o": [] and a concise expected answer/keyword in "a".`;
    } else {
        formatInstruction = `Generate an engaging mix of questions: mostly Multiple Choice (type: "mcq"), with some True/False (type: "tf") and Select All That Apply (type: "sata").`;
    }

    const prompt = `You are an expert trivia battle question generator. Generate exactly ${count} competitive exam questions.
Subject focus: ${subject === 'All' ? 'Mixed competitive science, mathematics, and logic' : subject} ${subtopic}.
Question format: ${formatInstruction}
The response MUST be a pure JSON array of ${count} objects. Do NOT include markdown code blocks.
IMPORTANT: Ensure all backslashes are properly escaped for JSON (e.g., if you use LaTeX, write \\\\( instead of \\(, and \\\\frac instead of \\frac).
Each object strictly must have this structure:
{
  "topic": "String",
  "subtopic": "String",
  "type": "mcq" | "tf" | "sata" | "short",
  "d": "medium",
  "q": "String (the question text)",
  "o": ["String", "String", ...],
  "a": "String" (or Array of Strings if sata),
  "e": "String (brief explanation)"
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
                max_tokens: 3072
            });

            const content = chatCompletion.choices[0]?.message?.content || "[]";
            let parsed = safeJSONParse(content);
            if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.questions)) parsed = parsed.questions;
                else if (Array.isArray(parsed.quiz)) parsed = parsed.quiz;
                else if (Array.isArray(parsed.items)) parsed = parsed.items;
            }
            questions = parsed;
            if (Array.isArray(questions)) {
                questions.forEach(normalizeQuestionFields);
            }
            if (!Array.isArray(questions) || questions.length < count) {
                questions = null;
                throw new Error("Invalid questions array");
            }

            if (mongoose.connection.readyState === 1) {
                for (const q of questions) {
                    if (q.q && q.a) {
                        if (!q.type) q.type = 'mcq';
                        sanitizeQuestionForDB(q);
                        const newQ = new Question(q);
                        newQ.save().catch(e => console.error(e));
                    }
                }
            }
        } catch (e) {
            console.warn(`Attempt ${attempts} note for arena:`, e.message);
        }
    }

    if (!questions || questions.length < count) {
        if (mongoose.connection.readyState === 1) {
            try {
                const query = {};
                if (subject !== 'All') query.topic = subject;
                if (format !== 'mix') query.type = format;
                const fallbacks = await Question.aggregate([{ $match: query }, { $sample: { size: count } }]);
                if (fallbacks && fallbacks.length > 0) {
                    questions = fallbacks;
                    console.log(`Using ${questions.length} DB fallbacks for arena.`);
                }
            } catch (dbErr) {
                console.error("DB aggregate failed:", dbErr.message);
            }
        }
        
        // Instant built-in fallback questions if Groq LLM or DB are unreachable
        if (!questions || questions.length === 0) {
            const fallbackBank = [
                { q: "What is Newton's First Law of Motion also known as?", o: ["Law of Universal Gravitation", "Law of Inertia", "Law of Conservation of Energy", "Law of Action and Reaction"], a: "Law of Inertia", type: "mcq", topic: "Physics", sub: "Kinematics", e: "Newton's First Law states an object at rest remains at rest unless acted on by an external net force (inertia)." },
                { q: "Sound waves travel faster in water than in air.", o: ["True", "False"], a: "True", type: "tf", topic: "Physics", sub: "Acoustics", e: "Because water has a higher bulk modulus and density coupling than air, sound travels about 4.3 times faster in water." },
                { q: "Which of the following are scalar quantities? (Select all that apply)", o: ["Mass", "Velocity", "Temperature", "Acceleration"], a: ["Mass", "Temperature"], type: "sata", topic: "Physics", sub: "Kinematics", e: "Mass and Temperature only have magnitude without directional vector components." },
                { q: "What fundamental particle carries a negative electric charge?", o: ["Proton", "Neutron", "Electron", "Photon"], a: "Electron", type: "mcq", topic: "Physics", sub: "Electromagnetism", e: "Electrons carry a negative elementary charge of approximately -1.602 × 10^-19 Coulombs." },
                { q: "What is the SI unit of electric resistance?", o: ["Volt", "Ampere", "Ohm", "Joule"], a: "Ohm", type: "mcq", topic: "Physics", sub: "Electromagnetism", e: "The ohm (symbol: Ω) is the SI unit of electrical impedance and resistance." }
            ];
            questions = fallbackBank.slice(0, count);
        }
    }

    return questions;
}

function endBattle(roomId) {
    const room = rooms[roomId];
    if (!room || room.state === 'ended') return;
    room.state = 'ended';

    // Sort: 1. Score desc, 2. Correct count desc, 3. Finish time asc
    const sorted = [...room.players].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
        return (a.finishTime || 999999) - (b.finishTime || 999999);
    });

    const leaderboard = sorted.map((p, idx) => {
        const rank = idx + 1;
        const xpBonus = rank === 1 ? 150 : (rank === 2 ? 100 : (rank === 3 ? 75 : 50));
        return {
            rank,
            id: p.id,
            username: p.username,
            playerTag: p.playerTag,
            avatar: p.avatar,
            score: p.score,
            correctCount: p.correctCount,
            totalQuestions: room.questions.length,
            accuracy: Math.round((p.correctCount / (room.questions.length || 1)) * 100),
            timeSeconds: p.finishTime ? Math.round(p.finishTime / 1000) : null,
            xpBonus,
            xpAwarded: xpBonus
        };
    });

    io.to(roomId).emit('battle-over', {
        rankings: leaderboard,
        leaderboard,
        config: room.config
    });

    if (!room.isPrivate) io.emit('public-rooms-list', getPublicRooms());
}

function leaveArenaRoom(socket, roomId) {
    const room = rooms[roomId];
    if (!room) return;

    socket.leave(roomId);
    const leavingPlayer = room.players.find(p => p.id === socket.id);
    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
        delete rooms[roomId];
    } else {
        if (room.hostId === socket.id && room.players.length > 0) {
            room.hostId = room.players[0].id;
            room.players[0].isHost = true;
            room.players[0].isReady = true;
        }

        if (room.state === 'playing') {
            io.to(roomId).emit('player-left', {
                username: leavingPlayer?.username || 'A player',
                players: room.players.map(p => ({
                    id: p.id,
                    username: p.username,
                    playerTag: p.playerTag,
                    avatar: p.avatar,
                    score: p.score,
                    progress: p.progress,
                    finished: p.finished
                }))
            });

            const allFinished = room.players.every(p => p.finished);
            if (allFinished && room.players.length > 0) {
                endBattle(roomId);
            }
        } else {
            io.to(roomId).emit('room-roster-update', {
                players: room.players,
                state: room.state,
                hostId: room.hostId
            });
        }
    }

    io.emit('public-rooms-list', getPublicRooms());
}

io.on('connection', (socket) => {
    // Send public rooms list on request
    socket.on('get-public-rooms', () => {
        socket.emit('public-rooms-list', getPublicRooms());
    });

    // Create Room
    socket.on('create-room', ({ isPrivate, maxPlayers, config, playerInfo }) => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        const passcode = isPrivate ? Math.floor(100000 + Math.random() * 900000).toString() : null;
        const username = playerInfo?.username || 'Scholar';
        const playerTag = playerInfo?.playerTag || `#SP-${roomId}`;
        const avatar = playerInfo?.avatar || '🎓';

        const room = {
            id: roomId,
            name: `${username}'s Arena`,
            isPrivate: !!isPrivate,
            passcode: passcode,
            maxPlayers: Math.min(8, Math.max(2, parseInt(maxPlayers) || 4)),
            hostId: socket.id,
            state: 'lobby',
            config: {
                subject: config?.subject || 'All',
                subtopic: config?.subtopic || 'All',
                format: config?.format || 'mix',
                count: [5, 10, 15].includes(parseInt(config?.count)) ? parseInt(config.count) : 5,
                timer: parseInt(config?.timer) >= 0 ? parseInt(config.timer) : 180
            },
            players: [
                {
                    id: socket.id,
                    username,
                    playerTag,
                    avatar,
                    score: 0,
                    progress: 0,
                    isHost: true,
                    isReady: true,
                    finished: false,
                    accuracy: 0,
                    correctCount: 0
                }
            ],
            questions: [],
            createdAt: Date.now()
        };

        rooms[roomId] = room;
        socket.join(roomId);

        socket.emit('room-created', {
            roomId,
            passcode,
            isPrivate: room.isPrivate,
            maxPlayers: room.maxPlayers,
            config: room.config,
            players: room.players,
            isHost: true
        });

        if (!room.isPrivate) {
            io.emit('public-rooms-list', getPublicRooms());
        }
    });

    // Join Room
    socket.on('join-room', ({ roomId, passcode, playerInfo }) => {
        const room = rooms[roomId];
        if (!room) {
            return socket.emit('room-error', 'Room not found. Check the code and try again.');
        }
        if (room.state !== 'lobby') {
            return socket.emit('room-error', 'Battle is already in progress in this room.');
        }
        if (room.players.length >= room.maxPlayers) {
            return socket.emit('room-error', 'This arena room is full.');
        }
        if (room.isPrivate) {
            if (!passcode || passcode.toString().trim() !== (room.passcode || '').toString().trim()) {
                return socket.emit('room-error', 'Invalid passcode for this private room.');
            }
        }

        const username = playerInfo?.username || `Scholar ${room.players.length + 1}`;
        const playerTag = playerInfo?.playerTag || `#SP-${Math.floor(1000 + Math.random() * 9000)}`;
        const avatar = playerInfo?.avatar || '⚡';

        const newPlayer = {
            id: socket.id,
            username,
            playerTag,
            avatar,
            score: 0,
            progress: 0,
            isHost: false,
            isReady: false,
            finished: false,
            accuracy: 0,
            correctCount: 0
        };

        room.players.push(newPlayer);
        socket.join(roomId);

        socket.emit('room-joined', {
            roomId,
            passcode: room.passcode,
            isPrivate: room.isPrivate,
            maxPlayers: room.maxPlayers,
            config: room.config,
            players: room.players,
            isHost: false
        });

        io.to(roomId).emit('room-roster-update', {
            players: room.players,
            state: room.state,
            hostId: room.hostId
        });

        if (!room.isPrivate) {
            io.emit('public-rooms-list', getPublicRooms());
        }
    });

    // Toggle Ready State
    socket.on('toggle-ready', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.isHost) {
            player.isReady = !player.isReady;
            io.to(roomId).emit('room-roster-update', {
                players: room.players,
                state: room.state,
                hostId: room.hostId
            });
        }
    });

    // Start Battle (Host Only)
    socket.on('start-battle', async ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;
        if (room.hostId !== socket.id) {
            return socket.emit('room-error', 'Only the host can start the battle.');
        }

        room.state = 'generating';
        io.to(roomId).emit('game-generating', {
            message: 'Generating battle questions with custom syllabus & configuration...'
        });
        if (!room.isPrivate) io.emit('public-rooms-list', getPublicRooms());

        try {
            const questions = await generateArenaQuestions(room.config);
            if (!questions || questions.length < room.config.count) {
                throw new Error("Could not assemble enough questions.");
            }
            room.questions = questions;
            room.state = 'playing';
            room.startTime = Date.now();
            room.players.forEach(p => {
                p.score = 0;
                p.progress = 0;
                p.finished = false;
                p.correctCount = 0;
                p.finishTime = null;
            });

            io.to(roomId).emit('game-start', {
                questions: room.questions,
                config: room.config,
                players: room.players.map(p => ({
                    id: p.id,
                    username: p.username,
                    playerTag: p.playerTag,
                    avatar: p.avatar,
                    score: p.score,
                    progress: p.progress
                }))
            });
        } catch (err) {
            console.error('Arena generation failed:', err);
            room.state = 'lobby';
            io.to(roomId).emit('room-error', 'Failed to generate battle questions. Please try again.');
            io.to(roomId).emit('room-roster-update', { players: room.players, state: room.state, hostId: room.hostId });
        }
    });

    // Submit Answer
    socket.on('submit-answer', ({ roomId, qIndex, isCorrect, answerTime }) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'playing') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        if (isCorrect) {
            const speedBonus = answerTime && answerTime < 8 ? 5 : (answerTime && answerTime < 15 ? 2 : 0);
            player.score += (10 + speedBonus);
            player.correctCount++;
        }
        player.progress = qIndex + 1;
        player.accuracy = Math.round((player.correctCount / player.progress) * 100);

        if (player.progress >= room.questions.length && !player.finished) {
            player.finished = true;
            player.finishTime = Date.now() - room.startTime;
        }

        io.to(roomId).emit('score-update', {
            players: room.players.map(p => ({
                id: p.id,
                username: p.username,
                playerTag: p.playerTag,
                avatar: p.avatar,
                score: p.score,
                progress: p.progress,
                finished: p.finished,
                accuracy: player.accuracy
            }))
        });

        const allFinished = room.players.every(p => p.finished);
        if (allFinished) {
            endBattle(roomId);
        }
    });

    // Rematch (Host Only)
    socket.on('rematch-battle', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.hostId !== socket.id) return;

        room.state = 'lobby';
        room.questions = [];
        room.players.forEach(p => {
            p.score = 0;
            p.progress = 0;
            p.finished = false;
            p.correctCount = 0;
            p.isReady = p.isHost;
        });

        io.to(roomId).emit('rematch-started', {
            config: room.config,
            players: room.players,
            hostId: room.hostId
        });

        if (!room.isPrivate) io.emit('public-rooms-list', getPublicRooms());
    });

    // Leave Room
    socket.on('leave-room', ({ roomId }) => {
        leaveArenaRoom(socket, roomId);
    });

    // Disconnect
    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            if (rooms[roomId].players.some(p => p.id === socket.id)) {
                leaveArenaRoom(socket, roomId);
            }
        }
    });
});

