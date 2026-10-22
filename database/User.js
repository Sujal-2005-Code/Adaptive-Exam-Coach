const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    grade: {
        type: String,
        default: 'General'
    },
    targetExam: {
        type: String,
        default: 'None'
    },
    customSyllabusName: {
        type: String,
        default: ''
    },
    customSyllabusText: {
        type: String,
        default: ''
    },
    customSyllabusData: {
        type: Object,
        default: {}
    },
    // Game Data
    xp: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now },
    badges: { type: [String], default: [] },
    
    // Trackers
    weaknessTracker: { type: mongoose.Schema.Types.Mixed, default: {} },
    microTracker: { type: mongoose.Schema.Types.Mixed, default: {} },
    quizHistory: { type: Array, default: [] }
}, {
    timestamps: true,
    minimize: false // ensures empty objects in trackers are saved
});

// Hash password before saving
UserSchema.pre('save', async function() {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
