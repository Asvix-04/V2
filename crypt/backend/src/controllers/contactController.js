const { Resend } = require('resend');
const dotenv = require('dotenv');

dotenv.config();

let resend;
if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('✅ Resend initialized successfully');
} else {
    console.warn('⚠️ RESEND_API_KEY is missing. Email features will be disabled.');
}

// @desc    Send contact email
// @route   POST /api/contact
// @access  Public
exports.sendContactEmail = async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // Basic Validation - only name and message are now required from UI
        if (!name || !message) {
            return res.status(400).json({ message: 'Please fill in all fields (Name and Message).' });
        }

        const emailFrom = process.env.EMAIL_FROM || 'onboarding@resend.dev';
        const contactEmail = process.env.CONTACT_RECEIVER_EMAIL || 'ksarul@ignou.ac.in';
        const finalSubject = subject || `New Message from ${name}`;

        const { data, error } = await resend.emails.send({
            from: emailFrom,
            to: contactEmail,
            subject: `Contact Form: ${finalSubject}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
                    <h2 style="color: #4F46E5; border-bottom: 2px solid #4F46E5; padding-bottom: 10px;">New Contact Message</h2>
                    <p><strong>Name:</strong> ${name}</p>
                    ${email ? `<p><strong>Email:</strong> ${email}</p>` : ''}
                    ${subject ? `<p><strong>Subject:</strong> ${subject}</p>` : ''}
                    <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; margin-top: 20px;">
                        <p style="margin-top: 0;"><strong>Message:</strong></p>
                        <p style="white-space: pre-wrap;">${message}</p>
                    </div>
                </div>
            `,
            reply_to: email || undefined, 
        });

        if (error) {
            console.error('Resend error:', error);
            return res.status(500).json({ message: 'Failed to send message.', error: error.message });
        }

        res.status(200).json({ message: 'Your message has been sent successfully!' });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
};
