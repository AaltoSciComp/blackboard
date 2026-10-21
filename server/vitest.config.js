const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
    // server.js is plain CommonJS that reads the real Node process.env at
    // runtime; Vite's define-replacement plugin misfires when transforming it.
    define: {},
    test: {
        include: ['test/**/*.test.js'],
        // Tests must run in a single fork: server.js keeps module-level state
        // (session cache etc.) that is shared by the endpoint tests.
        pool: 'forks',
        singleFork: true,
        // Longer timeout for first endpoint test: loading server.js triggers
        // the OpenAPI validator's first-time compile.
        testTimeout: 20000,
    },
});
