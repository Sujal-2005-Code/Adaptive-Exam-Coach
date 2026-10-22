const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    topic: { type: String, required: true },
    subtopic: { type: String },
    d: { type: String, required: true }, // difficulty: easy, medium, hard
    type: { type: String, required: true }, // format: mcq, tf, sata, short
    q: { type: String, required: true }, // question text
    o: [{ type: String }], // options array
    a: { type: String, required: true }, // correct answer
    h: { type: String }, // hint
    e: { type: String }, // explanation
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Question', questionSchema);
