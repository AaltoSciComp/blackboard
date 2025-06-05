const { Pool } = require('pg')
const readline = require('readline');
const logger = require('npmlog');

// Database connection
const pool = new Pool({
    user: 'blackboard',
    host: 'blackboard-db',
    database: 'blackboard',
    password: 'blackboard',
    port: 5432, // Default PostgreSQL port
});

// Function to prompt the user for confirmation
function askConfirmation(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
        });
    });
}

// Function to delete a session
async function deleteSession(sessionId) {
    try {
        // Validate input
        if (isNaN(sessionId)) {
            throw new Error('Invalid session ID');
        }

        // Fetch session details
        const sessionResult = await pool.query(
            `SELECT id, sessionname, lastlogin, lastview FROM cbsessions WHERE id = $1`,
            [sessionId]
        );

        if (sessionResult.rowCount === 0) {
            throw new Error(`Session ID ${sessionId} not found.`);
        }

        const session = sessionResult.rows[0];
        console.log(`Session ID: ${session.id}`);
        console.log(`Session Name: ${session.sessionname}`);
        console.log(`Last edited: ${session.lastlogin}`);
        console.log(`Last viewed: ${session.lastview}`);

        // Ask for confirmation
        const confirmed = await askConfirmation(
            `Are you sure you want to delete this session? (yes/no): `
        );

        if (!confirmed) {
            console.log('Operation cancelled.');
            return;
        }

        // Begin transaction
        await pool.query('BEGIN');

        // Delete all shapes associated with the session
        const deleteShapesResult = await pool.query(
            `DELETE FROM shapes WHERE sessionid = $1`,
            [sessionId]
        );
        logger.info(`Deleted ${deleteShapesResult.rowCount} shapes for session ID ${sessionId}.`);

        // Delete all boards associated with the session
        const deleteBoardsResult = await pool.query(
            `DELETE FROM boards WHERE sessionid = $1`,
            [sessionId]
        );
        logger.info(`Deleted ${deleteBoardsResult.rowCount} boards for session ID ${sessionId}.`);

        // Delete the session itself
        const deleteSessionResult = await pool.query(
            `DELETE FROM cbsessions WHERE id = $1 RETURNING id, sessionname`,
            [sessionId]
        );

        if (deleteSessionResult.rowCount === 0) {
            throw new Error(`Session ID ${sessionId} not found.`);
        }

        const deletedSession = deleteSessionResult.rows[0];
        logger.info(`Deleted session ID ${deletedSession.id} (${deletedSession.sessionname}).`);
        console.log(`Deleted session ID ${deletedSession.id} (${deletedSession.sessionname}).`);

        // Commit transaction
        await pool.query('COMMIT');
    } catch (error) {
        // Rollback transaction in case of error
        await pool.query('ROLLBACK');
        logger.error('Error deleting session:', error.message);
        console.error('Error deleting session:', error.message);
    } finally {
        // Close the database connection
        await pool.end();
    }
}

// Main function to handle command-line arguments
(async () => {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error('Usage: node deletesession.js session_id');
        process.exit(1);
    }

    const sessionId = parseInt(args[0], 10);
    await deleteSession(sessionId);
})();