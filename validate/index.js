#!/usr/bin/env node

/**
 * Gridfinity 目录校验工具
 *
 * 用法：
 *   node validate/index.js [--verbose] [--section "章节名"] [--errors-only]
 *
 * 按章节使用一组可配置的规则校验 README.md。
 * --section 参数请使用英文章节名（如 Baseplates），中文标题会在 parser.js 中自动映射。
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSections } from './parser.js';
import { createEngine } from './rules/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- CLI argument parsing ---
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const errorsOnly = args.includes('--errors-only');
const sectionIdx = args.indexOf('--section');
const filterSection = sectionIdx !== -1 ? args[sectionIdx + 1] : null;

// --- Load README ---
const readmePath = resolve(__dirname, '..', 'README.md');
let markdown;
try {
  markdown = readFileSync(readmePath, 'utf-8');
} catch (err) {
  console.error(`❌ 无法读取 README.md：${readmePath}`);
  console.error(err.message);
  process.exit(2);
}

// --- Parse ---
const sections = parseSections(markdown);

if (verbose) {
  console.log(`📄 已解析 ${sections.length} 个章节：`);
  for (const s of sections) {
    const tableInfo = s.tables.length > 0
      ? `（${s.tables.length} 个表格，共 ${s.tables.reduce((sum, t) => sum + t.rows.length, 0)} 行）`
      : '';
    console.log(`   • ${s.name}${tableInfo}`);
  }
  console.log('');
}

// --- Validate ---
const engine = createEngine();

if (verbose) {
  const summary = engine.getSummary();
  const totalRules = summary.global + Object.values(summary.sections).reduce((a, b) => a + b, 0);
  console.log(`🔧 已加载 ${totalRules} 条规则（全局规则 ${summary.global} 条，${Object.keys(summary.sections).length} 个章节有专属规则）`);
  console.log('');
}

let sectionsToValidate = sections;
if (filterSection) {
  sectionsToValidate = sections.filter(s => s.name.toLowerCase().includes(filterSection.toLowerCase()));
  if (sectionsToValidate.length === 0) {
    console.error(`❌ 未找到与 "${filterSection}" 匹配的章节`);
    process.exit(2);
  }
}

const results = engine.validate(sectionsToValidate);

// --- Filter ---
let filteredResults = results;
if (errorsOnly) {
  filteredResults = results.filter(r => r.severity === 'error');
}

// --- Report ---
if (filteredResults.length === 0) {
  console.log('✅ 未发现问题！');
  process.exit(0);
}

// Group by section
const grouped = new Map();
for (const r of filteredResults) {
  if (!grouped.has(r.section)) grouped.set(r.section, []);
  grouped.get(r.section).push(r);
}

const errorCount = filteredResults.filter(r => r.severity === 'error').length;
const warningCount = filteredResults.filter(r => r.severity === 'warning').length;

console.log(`共发现 ${filteredResults.length} 个问题：${errorCount} 个错误，${warningCount} 个警告\n`);

for (const [section, issues] of grouped) {
  console.log(`── ${section}（${issues.length} 个问题）──`);
  for (const issue of issues) {
    const icon = issue.severity === 'error' ? '❌' : '⚠️';
    const lineInfo = issue.line ? `L${issue.line}` : '   ';
    console.log(`  ${icon} ${lineInfo} [${issue.ruleId}] ${issue.message}`);
  }
  console.log('');
}

// --- Exit code ---
process.exit(errorCount > 0 ? 1 : 0);
