#!/usr/bin/env node

/**
 * GetPawsy — Post-Deploy Verification Runner
 * 
 * Runs: impact model → lighthouse mobile → lighthouse desktop
 * Then prints next steps.
 */

import { execSync } from 'child_process';

const run = (label, cmd) => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(60)}\n`);
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 180_000 });
  } catch (e) {
    console.error(`⚠️  ${label} failed:`, e.message);
  }
};

run('📊 Impact Model', 'node scripts/impact-model.mjs');
run('📱 Lighthouse Mobile Audit', 'node scripts/lighthouse-audit.mjs mobile');
run('🖥️  Lighthouse Desktop Audit', 'node scripts/lighthouse-audit.mjs desktop');

console.log('\n' + '═'.repeat(60));
console.log('  ✅ Post-Deploy Verification Complete');
console.log('═'.repeat(60));
console.log('\n📂 Outputs:');
console.log('   • Impact model:     printed above');
console.log('   • Lighthouse HTML:  ./audits/*.report.html');
console.log('   • Lighthouse JSON:  ./audits/*.report.json');
console.log('\n📋 Next Steps:');
console.log('   1. Review docs/post-deploy-verification.md');
console.log('   2. Run GSC URL Inspection on key pages');
console.log('   3. Set 28-day checkpoint reminder');
console.log('   4. Monitor GSC Page Experience weekly\n');
