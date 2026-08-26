const { getFirestore } = require('../config/db');
const bcrypt = require('bcrypt');

class User {
    constructor(data) {
        this.id = data.id || null;
        this.name = typeof data.name === 'string' ? data.name.trim() : data.name;
        this.email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : data.email;
        this.password = data.password;
        this.role = data.role || 'student';
        this.googleId = data.googleId || null;
        this.githubId = data.githubId || null;
        this.profilePhoto = data.profilePhoto || null;
        this.emailVerified = data.emailVerified !== undefined ? Boolean(data.emailVerified) : undefined;
        this.createdAt = data.createdAt || new Date();
    }

    // Validate user data
    static validate(data) {
        const errors = [];
        const name = typeof data.name === 'string' ? data.name.trim() : data.name;
        const email = typeof data.email === 'string' ? data.email.trim() : data.email;
        const password = typeof data.password === 'string' ? data.password : data.password;

        if (!name) {
            errors.push('Please add a name');
        }
        if (!email) {
            errors.push('Please add an email');
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.push('Please add a valid email');
        }
        if (!password) {
            errors.push('Please add a password');
        } else if (password.length < 6) {
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
                const updateData = {
                    name: this.name,
                    email: this.email,
                    role: this.role,
                    updatedAt: new Date()
                };
                if (this.emailVerified !== undefined) {
                    updateData.emailVerified = this.emailVerified;
                }
                await usersRef.doc(this.id).update(updateData);
            } else {
                // Create new user
                const docData = {
                    name: this.name,
                    email: this.email,
                    password: this.password,
                    role: this.role,
                    googleId: this.googleId,
                    githubId: this.githubId,
                    profilePhoto: this.profilePhoto,
                    createdAt: new Date()
                };
                if (this.emailVerified !== undefined) {
                    docData.emailVerified = this.emailVerified;
                }
                const docRef = await usersRef.add(docData);
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

    // Update user by ID
    static async update(id, updates) {
        const db = getFirestore();

        try {
            updates.updatedAt = new Date();
            await db.collection('users').doc(id).update(updates);

            // Return the updated user
            const doc = await db.collection('users').doc(id).get();
            if (!doc.exists) {
                return null;
            }
            return new User({
                id: doc.id,
                ...doc.data()
            });
        } catch (error) {
            throw new Error(`Failed to update user: ${error.message}`);
        }
    }

    // Get user without password
    toJSON() {
        const { password, ...userWithoutPassword } = this;
        return userWithoutPassword;
    }
}

module.exports = User;
