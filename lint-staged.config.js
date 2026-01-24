export default {
  // TypeScript and JavaScript files
  '*.{ts,tsx}': [
    () => 'tsc --noEmit --skipLibCheck', // Run once for all staged TS files
    'eslint --fix --max-warnings 0',
    'prettier --write',
  ],
  '*.{js,jsx}': [
    'eslint --fix --max-warnings 0',
    'prettier --write',
  ],
  
  // CSS and styling
  '*.{css,scss}': [
    'prettier --write',
  ],
  
  // JSON, Markdown, and config files
  '*.{json,md,yml,yaml}': [
    'prettier --write',
  ],
  
  // HTML files
  '*.html': [
    'prettier --write',
  ],
};
