// Runs a SQL file against the configured Sequelize database
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

(async () => {
	try {
		const fileArg = process.argv[2];
		if (!fileArg) {
			console.error('Usage: node scripts/run-sql.js <path-to-sql-file>');
			process.exit(1);
		}

		const filePath = path.isAbsolute(fileArg)
			? fileArg
			: path.join(process.cwd(), fileArg);

		if (!fs.existsSync(filePath)) {
			console.error(`SQL file not found: ${filePath}`);
			process.exit(1);
		}

		const sql = fs.readFileSync(filePath, 'utf8');
		if (!sql || !sql.trim()) {
			console.error('SQL file is empty.');
			process.exit(1);
		}

		// Split into individual statements, remove comments and blank lines
		const statements = sql
			.replace(/--.*$/gm, '') // strip line comments
			.replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
			.split(';')
			.map(s => s.trim())
			.filter(Boolean);

		console.log(`Executing ${statements.length} SQL statement(s) from: ${filePath}`);
		for (const stmt of statements) {
			// Skip MySQL client-only commands like SOURCE
			if (/^source\s+/i.test(stmt)) continue;
			await db.sequelize.query(stmt, { raw: true });
		}
		console.log('✅ SQL executed successfully.');
		process.exit(0);
	} catch (err) {
		console.error('❌ Failed to execute SQL:', err.message);
		process.exit(1);
	}
})();


