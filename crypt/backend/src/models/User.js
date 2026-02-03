const bcrypt = require('bcrypt');
const { getFirestore } = require('../config/db');

class User {
    constructor(data) {
        this.id = data.id || null;
        this.name = data.name;
        this.email = data.email;
        this.password = data.password;
        this.role = data.role || 'student';
        this.createdAt = data.createdAt || new Date();
    }

    // Validate user data
    static validate(data) {
        const errors = [];

        if (!data.name) {
            errors.push('Please add a name');
        }
        if (!data.email) {
            errors.push('Please add an email');
        } else if (!/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(data.email)) {
            errors.push('Please add a valid email');
        }
        if (!data.password) {
            errors.push('Please add a password');
        } else if (data.password.length < 6) {
            errors.push('Password must be at least 6 characters');
        }
        if (data.role && !['student', 'teacher'].includes(data.role)) {
            errors.push('Role must be either student or teacher');
        }

        return errors;
    }

    // Hash password
    async hashPassword() {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }

    // Compare password
    async matchPassword(enteredPassword) {
        return await bcrypt.compare(enteredPassword, this.password);
    }

    // Create user in Firestore
    async save() {
        const db = getFirestore();
        const usersRef = db.collection('users');

        try {
            if (this.id) {
                // Update existing user
                await usersRef.doc(this.id).update({
                    name: this.name,
                    email: this.email,
                    role: this.role,
                    updatedAt: new Date()
                });
            } else {
                // Create new user
                const docRef = await usersRef.add({
                    name: this.name,
                    email: this.email,
                    password: this.password,
                    role: this.role,
                    createdAt: new Date()
                });
                this.id = docRef.id;
            }
            return this;
        } catch (error) {
            throw new Error(`Failed to save user: ${error.message}`);
        }
    }

    // Find user by email
    static async findOne(query) {
        const db = getFirestore();
        const usersRef = db.collection('users');

        try {
            if (query.email) {
                const snapshot = await usersRef.where('email', '==', query.email).limit(1).get();
                if (snapshot.empty) {
                    return null;
                }
                const doc = snapshot.docs[0];
                return new User({
                    id: doc.id,
                    ...doc.data()
                });
            }
            return null;
        } catch (error) {
            throw new Error(`Failed to find user: ${error.message}`);
        }
    }

    // Find user by ID
    static async findById(id) {
        const db = getFirestore();

        try {
            const doc = await db.collection('users').doc(id).get();
            if (!doc.exists) {
                return null;
            }
            return new User({
                id: doc.id,
                ...doc.data()
            });
        } catch (error) {
            throw new Error(`Failed to find user by ID: ${error.message}`);
        }
    }

    // Get user without password
    toJSON() {
        const { password, ...userWithoutPassword } = this;
        return userWithoutPassword;
    }
}

module.exports = User;
