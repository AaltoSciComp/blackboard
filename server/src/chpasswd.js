const { Pool } = require('pg')
const bcrypt = require('bcrypt');
const logger = require('npmlog');

// Database connection
const pool = new Pool({
    user: 'blackboard',
    host: 'blackboard-db',
    database: 'blackboard',
    password: 'blackboard',
    port: 5432, // Default PostgreSQL port
});

// Function to change the password
async function changePassword(sessionId, newPassword) {
    try {
        // Validate inputs
        if (isNaN(sessionId) || !newPassword) {
            throw new Error('Invalid session ID or password');
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the database
        const result = await pool.query(
            `UPDATE cbsessions SET presenterpw = $1 WHERE id = $2 RETURNING id, sessionname`,
            [hashedPassword, sessionId]
        );

        if (result.rowCount === 0) {
            logger.error(`Session ID ${sessionId} not found.`);
            console.error(`Error: Session ID ${sessionId} not found.`);
        } else {
            const session = result.rows[0];
            logger.info(`Password updated successfully for session ID ${sessionId} (${session.sessionname}).`);
            console.log(`Password updated successfully for session ID ${sessionId} (${session.sessionname}).`);
        }
    } catch (error) {
        logger.error('Error updating password:', error.message);
        console.error('Error updating password:', error.message);
    } finally {
        // Close the database connection
        await pool.end();
    }
}

// Main function to handle command-line arguments
(async () => {
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error('Usage: node chpasswd.js session_id new_password');
        process.exit(1);
    }

    const [sessionId, newPassword] = args;
    await changePassword(parseInt(sessionId, 10), newPassword);
})();