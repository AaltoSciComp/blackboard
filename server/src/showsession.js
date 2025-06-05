const { Pool } = require('pg');
const logger = require('npmlog');

// Database connection
const pool = new Pool({
    user: 'blackboard',
    host: 'blackboard-db',
    database: 'blackboard',
    password: 'blackboard',
    port: 5432, // Default PostgreSQL port
});

// Function to show a session
async function showSession(sessionId) {
    try {
        // Validate input
        if (isNaN(sessionId)) {
            throw new Error('Invalid session ID');
        }

        // Update the database to set ispublic to true
        const result = await pool.query(
            `UPDATE cbsessions SET ispublic = true WHERE id = $1 RETURNING id, sessionname`,
            [sessionId]
        );

        if (result.rowCount === 0) {
            logger.error(`Session ID ${sessionId} not found.`);
            console.error(`Error: Session ID ${sessionId} not found.`);
        } else {
            const session = result.rows[0];
            logger.info(`Session ID ${sessionId} (${session.sessionname}) is now public.`);
            console.log(`Session ID ${sessionId} (${session.sessionname}) is now public.`);
        }
    } catch (error) {
        logger.error('Error showing session:', error.message);
        console.error('Error showing session:', error.message);
    } finally {
        // Close the database connection
        await pool.end();
    }
}

// Main function to handle command-line arguments
(async () => {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error('Usage: node showsession.js session_id');
        process.exit(1);
    }

    const sessionId = parseInt(args[0], 10);
    await showSession(sessionId);
})();