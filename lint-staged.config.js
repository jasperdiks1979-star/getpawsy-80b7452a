export default {
  // TypeScript and JavaScript files
  '*.{ts,tsx}': [
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
