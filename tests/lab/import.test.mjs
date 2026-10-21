// Survey importers: Qualtrics .qsf, LimeSurvey .lss, REDCap data dictionary, and the lab's spreadsheet template
// (CSV and .xlsx). All fixtures are synthetic (tests/lab/fixtures/import/).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importSurvey, detectFormat, ImportError, LIMITS } from '../../netlify/lib/lab/import/index.mjs';
import { parseCsv } from '../../netlify/lib/lab/import/csv.mjs';
import { parseXml } from '../../netlify/lib/lab/import/xml.mjs';
import { htmlToText } from '../../netlify/lib/lab/import/common.mjs';
import { parseExpr, toDisplayIf, Unsupported } from '../../netlify/lib/lab/import/expr.mjs';
import { validateContent } from '../../netlify/lib/lab/content.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { cleanAnswers } from '../../netlify/lib/lab/engine.mjs';
import { makeXlsx, makeZip } from './import-helpers.mjs';
const fx = n => readFileSync(fileURLToPath(new URL('./fixtures/import/' + n, import.meta.url)), 'utf8');
const template = readFileSync(fileURLToPath(new URL('../../static/lab/templates/survey-template.csv', import.meta.url)), 'utf8');
const type = TYPES.vignettes;
const run = (filename, data, extra = {}) => importSurvey({ filename, data, ...extra });
const byId = (r, id) => r.content.survey.pre.find(q => q.id === id);
const bad = (fn, re) => assert.throws(fn, e => e instanceof ImportError && re.test(e.userMessage), 'expected an ImportError matching ' + re);
const check = r => {
  assert.deepEqual(validateContent(r.content, type), [], 'imported content passes validateContent');
  const c = r.report.counts, qs = r.content.survey.pre;
  assert.equal(c.questions, qs.length); assert(c.pages >= 1 && c.conditions >= 1);
  assert(r.report.mapped.length && Array.isArray(r.report.approximated) && Array.isArray(r.report.unsupported) && Array.isArray(r.report.warnings));
  assert.equal(r.content.design.sessions.every(s => s.items.length === 0), true, 'survey-only: sessions have no items');
  assert.equal(r.content.consent.approved, false); assert(/DRAFT/.test(r.content.consent.paragraphs[0]), 'consent is a marked placeholder');
  assert(qs.every(q => /^[a-z][a-z0-9_]{0,40}$/.test(q.id)) && new Set(qs.map(q => q.id)).size === qs.length);
  assert(!JSON.stringify(r.content).match(/<script|<style|alert\(/i), 'no script or style text survives');
  return r;
};

// ================= Qualtrics =================
{
  const r = check(run('demo.qsf', fx('demo.qsf')));
  assert.equal(r.report.detected, 'qsf'); assert.deepEqual(r.report.counts, { questions: 30, pages: 7, conditions: 2, embedded: 3, info: 4, sessions: 1 });
  // text and HTML
  assert.equal(byId(r, 'intro').text, 'Welcome to the demo survey.\nIt takes about 5 minutes.\nThank you & enjoy.'.replace('survey.\n', 'survey.\n'), 'HTML stripped, line breaks kept, entities decoded, script and style dropped');
  // types
  const social = byId(r, 'social');
  assert.equal(social.type, 'choice'); assert.deepEqual(social.options.map(o => o.value), ['1', '0'], 'recode values become option values'); assert.equal(social.required, true);
  assert.equal(byId(r, 'platforms').type, 'multi'); assert.equal(byId(r, 'country').type, 'select'); assert.equal(byId(r, 'comments').long, true); assert.equal(byId(r, 'first_name').long, false);
  assert.deepEqual(['trust_1', 'trust_2', 'trust_3'].map(i => [byId(r, i).type, byId(r, i).n, byId(r, i).group, byId(r, i).page]), [['scale', 5, 'trust', 2], ['scale', 5, 'trust', 2], ['scale', 5, 'trust', 2]], 'a matrix is one question per row');
  assert.equal(byId(r, 'trust_1').groupText, 'How much do you agree?'); assert.deepEqual(byId(r, 'trust_1').labels, ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree']);
  assert.deepEqual([byId(r, 'mood').type, byId(r, 'mood').n], ['scale', 11], 'a snapped 0-10 slider is an 11-point scale');
  assert.deepEqual([byId(r, 'confidence').type, byId(r, 'confidence').min, byId(r, 'confidence').max], ['number', 0, 100], 'a 0-100 slider is a number with min and max');
  assert.deepEqual([byId(r, 'contact_1').type, byId(r, 'contact_2').group], ['text', 'contact'], 'a TE form is several text questions');
  assert.deepEqual([byId(r, 'age').type, byId(r, 'age').min, byId(r, 'age').max], ['number', 0, 120]);
  assert.deepEqual([byId(r, 'nps').type, byId(r, 'nps').n], ['scale', 11]);
  assert.equal(byId(r, 'intro').type, 'info'); assert.equal(byId(r, 'intro').required, false);
  assert.equal(byId(r, 'page_timer'), undefined); assert.equal(byId(r, 'browser_meta'), undefined);
  assert.equal(byId(r, 'platforms_3_text').type, 'text', 'a choice with a text box gets a follow-up question');
  // pages: block starts a page, Page Break splits one
  assert.deepEqual([byId(r, 'first_name').page, byId(r, 'social').page, byId(r, 'cond_a_q').page, byId(r, 'cond_b_q').page, byId(r, 'skipper').page], [1, 2, 3, 4, 5]);
  // randomizer: one condition per block, questions filtered by condition
  assert.deepEqual(r.content.design.conditions.map(c => c.id), ['c1', 'c2']); assert(r.content.design.conditions[0].label.includes('Version A'));
  assert.deepEqual(byId(r, 'cond_a_q').conditions, ['c1']); assert.deepEqual(byId(r, 'cond_b_q').conditions, ['c2']); assert.deepEqual(byId(r, 'social').conditions, []);
  // embedded data
  assert.deepEqual(r.content.embedded, [{ name: 'prolific_pid', source: 'url', param: 'PROLIFIC_PID' }, { name: 'study_id', source: 'value', value: 'pilot' }, { name: 'session_id', source: 'url', param: 'SESSION_ID' }]);
  // logic
  assert.deepEqual(byId(r, 'platforms').displayIf, { q: 'social', op: 'eq', value: '1' }, 'display logic');
  assert.deepEqual(byId(r, 'social_followup').displayIf, { q: 'social', op: 'eq', value: '1' }, 'a branch becomes display logic on its blocks');
  assert.deepEqual(byId(r, 'after_skip_1').displayIf, { q: 'skipper', op: 'neq', value: '2' }, 'skip to end of block hides the following questions in the block');
  assert.deepEqual(byId(r, 'after_skip_2').displayIf, { q: 'skipper', op: 'neq', value: '2' }); assert.equal(byId(r, 'skipper').displayIf, undefined);
  assert.deepEqual(byId(r, 'last_q').displayIf.all.map(n => n.q || n.ed || 'group'), ['study_id', 'group', 'eos'], 'embedded-data logic, the too-young end branch, and skip to end of survey');
  assert.deepEqual(byId(r, 'bigstuff').displayIf.all[0], { q: 'age', op: 'gt', value: '17' });
  assert.deepEqual(byId(r, 'eos').displayIf, { any: [{ q: 'age', op: 'notAnswered' }, { q: 'age', op: 'gte', value: '13' }] }, 'a branch that ends the survey hides the later questions when its logic holds');
  // piped text
  assert.equal(byId(r, 'platforms').text, 'Which platforms do you use, {{q:first_name}}?');
  assert(byId(r, 'echo').text.startsWith('Hello {{q:first_name}}, your id is {{ed:prolific_pid}} and ') && !/\$\{/.test(byId(r, 'echo').text));
  // report: unsupported pieces with their IDs
  const un = r.report.unsupported.map(x => x.source + ' ' + x.what).join('\n');
  for (const want of ['QID15', 'JavaScript', 'QID16', 'Carry-forward', 'QID17', 'QID13', 'QID14', 'quotas', 'Authenticator', 'computed', 'Loop & Merge', 'QID53', 'rand://Dice', 'SelectedAnswers']) assert(un.includes(want), 'unsupported report mentions ' + want + '\n' + un);
  assert(r.report.approximated.some(a => /randomiz/i.test(a.what) || /balanc/i.test(a.what) || /Net Promoter/.test(a.what)));
  assert(r.report.outline.length === 7 && r.report.outline[1].questions.find(q => q.id === 'platforms').logic === 'Show when social is "Yes"');
  // round trip: the engine drops answers the logic hides
  const items = r.content.survey.pre;
  assert.deepEqual(cleanAnswers({ social: '0', platforms: ['1'], first_name: 'A' }, items, { condition: 'c1', embedded: { prolific_pid: 'P' } }), { social: '0', first_name: 'A' }, 'platforms is hidden when social = No');
  assert.deepEqual(cleanAnswers({ social: '1', platforms: ['1'] }, items, { condition: 'c1', embedded: {} }), { social: '1', platforms: ['1'] });
  assert.deepEqual(cleanAnswers({ skipper: '2', after_skip_1: 'x', age: '10', eos: '1' }, items, { condition: 'c1', embedded: { study_id: 'pilot' } }), { skipper: '2', age: '10' }, 'skip logic, and the too-young end branch hides "eos"');
  assert.deepEqual(cleanAnswers({ skipper: '1', after_skip_1: 'x', age: '20', eos: '2', last_q: 'z' }, items, { condition: 'c1', embedded: { study_id: 'pilot' } }), { skipper: '1', after_skip_1: 'x', age: '20', eos: '2' }, 'skip to end of survey hides the final question');
}

// a randomizer showing 2 of 3 blocks gives one condition per combination; several randomizers multiply, up to 8
{
  const mk = (n, sub) => {
    const els = [], blocks = {}, flow = [];
    for (let i = 1; i <= n; i++) { els.push({ Element: 'SQ', PrimaryAttribute: 'QID' + i, Payload: { QuestionID: 'QID' + i, DataExportTag: 'q' + i, QuestionType: 'TE', Selector: 'SL', QuestionText: 'Q' + i } }); blocks[i] = { Type: 'Standard', ID: 'BL' + i, Description: 'Block ' + i, BlockElements: [{ Type: 'Question', QuestionID: 'QID' + i }] }; flow.push({ Type: 'Standard', ID: 'BL' + i }); }
    els.push({ Element: 'BL', Payload: blocks }, { Element: 'FL', Payload: { Type: 'Root', Flow: [{ Type: 'Randomizer', SubSet: sub, EvenPresentation: true, Flow: flow }] } });
    return JSON.stringify({ SurveyEntry: { SurveyName: 'R' }, SurveyElements: els });
  };
  const r = check(run('r.qsf', mk(3, 2)));
  assert.equal(r.content.design.conditions.length, 3); assert.deepEqual(r.content.survey.pre.map(q => q.conditions.length), [2, 2, 2]);
  const r5 = check(run('r.qsf', mk(5, 2)));   // 10 combinations: over the limit of 8
  assert.equal(r5.content.design.conditions.length, 1); assert(r5.report.unsupported.some(u => /10 combinations/.test(u.what)));
}

// ================= LimeSurvey =================
{
  const r = check(run('demo.lss', fx('demo.lss')));
  assert.equal(r.report.detected, 'lss'); assert.equal(r.report.counts.pages, 3);
  assert.equal(byId(r, 'q1').type, 'choice'); assert.deepEqual(byId(r, 'q1').options.map(o => o.value), ['Y', 'N']); assert.equal(byId(r, 'q1').required, true);
  assert.deepEqual(byId(r, 'q2').options.map(o => o.value), ['A1', 'A2', 'A3', '-oth-']); assert.equal(byId(r, 'q2').text, 'Which best describes your role{{q:q1}}?', 'piping {Q1}');
  assert.deepEqual(byId(r, 'q2_other').displayIf, { q: 'q2', op: 'eq', value: '-oth-' });
  assert.deepEqual([byId(r, 'q3').type, byId(r, 'q3').options.map(o => o.value)], ['multi', ['SQ001', 'SQ002', 'SQ003']]);
  assert.deepEqual([byId(r, 'q4_sq001').type, byId(r, 'q4_sq001').n, byId(r, 'q4_sq001').group, byId(r, 'q4_sq001').groupText], ['scale', 4, 'q4', 'How much do you agree?'], 'array question expands to rows');
  assert.deepEqual([byId(r, 'q5').type, byId(r, 'q5').min, byId(r, 'q5').max], ['number', 0, 80]);
  assert.deepEqual([byId(r, 'q6').type, byId(r, 'q6').long], ['text', true]); assert.equal(byId(r, 'q7').type, 'info');
  assert.deepEqual(byId(r, 'q5').displayIf, { q: 'q1', op: 'eq', value: 'Y' }, 'group relevance applies to its questions');
  assert.deepEqual(byId(r, 'q6').displayIf, { all: [{ q: 'q1', op: 'eq', value: 'Y' }, { any: [{ q: 'q2', op: 'eq', value: 'A2' }, { q: 'q5', op: 'gt', value: '3' }] }] }, 'and/or relevance');
  assert.deepEqual(byId(r, 'q8').displayIf.all[1], { q: 'q3', op: 'eq', value: 'SQ002' }, 'multiple-choice option test'); assert.equal(byId(r, 'q9').displayIf.q, 'q1', 'a complex equation falls back to the group rule');
  assert.deepEqual(byId(r, 'q11').displayIf.all[0], { q: 'q4_sq001', op: 'eq', value: '3' }, 'array answer code A3 is point 3');
  const un = r.report.unsupported.map(x => x.source + ' ' + x.what).join('\n');
  for (const want of ['Q10', 'Ranking', 'if()', 'quotas', 'random_order', 'rg1']) assert(un.includes(want), 'unsupported mentions ' + want + '\n' + un);
  assert.equal(byId(r, 'q10'), undefined);
}

// ================= REDCap =================
{
  const r = check(run('dictionary.csv', fx('dictionary.csv')));
  assert.equal(r.report.detected, 'redcap'); assert.deepEqual(r.report.identifiers, ['record_id', 'full_name', 'followup']);
  assert(r.report.warnings.some(w => /Identifiable data/.test(w) && w.includes('record_id')));
  assert.deepEqual([byId(r, 'age').type, byId(r, 'age').min, byId(r, 'age').max, byId(r, 'age').required], ['number', 0, 120, true]);
  assert.deepEqual([byId(r, 'sex').type, byId(r, 'sex').options], ['choice', [{ value: '1', label: 'Male' }, { value: '2', label: 'Female' }, { value: '3', label: 'Other' }]]);
  assert.deepEqual(byId(r, 'pregnant').options.map(o => o.value), ['1', '0']);
  assert.equal(byId(r, 'symptoms').type, 'multi'); assert.equal(byId(r, 'notes').long, true);
  assert.deepEqual(byId(r, 'pregnant').displayIf, { q: 'sex', op: 'eq', value: '2' });
  assert.deepEqual(byId(r, 'severity').displayIf, { any: [{ q: 'symptoms', op: 'eq', value: '1' }, { q: 'symptoms', op: 'eq', value: '2' }] }, 'checkbox option tests');
  assert.deepEqual(byId(r, 'followup').displayIf, { all: [{ q: 'age', op: 'gte', value: '18' }, { any: [{ q: 'sex', op: 'eq', value: '1' }, { q: 'symptoms', op: 'eq', value: '2' }] }] });
  assert.deepEqual(byId(r, 'rating').displayIf, { q: 'followup', op: 'answered' });
  assert.deepEqual([byId(r, 'sat_work').group, byId(r, 'sat_team').group, byId(r, 'sat_work').groupText], ['satisfaction', 'satisfaction', 'Rate each statement']);
  assert.equal(byId(r, 'sat_team').text, 'I enjoy my team, {{q:full_name}}');
  assert.equal(byId(r, 'intro').type, 'info');
  assert.deepEqual([byId(r, 'record_id').page, byId(r, 'symptoms').page, byId(r, 'followup').page], [1, 2, 3], 'forms become pages');
  const un = r.report.unsupported.map(x => x.source + ' ' + x.what).join('\n');
  for (const want of ['bmi', 'Calculated', 'upload', 'datediff', '@HIDDEN']) assert(un.includes(want), 'unsupported mentions ' + want + '\n' + un);
  const s = check(run('dictionary.csv', fx('dictionary.csv'), { options: { formsAs: 'sessions' } }));
  assert.equal(s.content.design.sessions.length, 3); assert.deepEqual([byId(s, 'age').sessions, byId(s, 'symptoms').sessions, byId(s, 'rating').sessions], [[1], [2], [3]], 'forms as sessions');
  assert(s.report.unsupported.some(u => /another form, which is another session/.test(u.what)), 'branching across forms cannot work across sessions');
}

// ================= spreadsheet template =================
{
  const rows = parseCsv(template).filter(r => !String(r[0]).startsWith('#'));
  const c = check(run('survey-template.csv', template));
  assert.equal(c.report.detected, 'sheet');
  assert.deepEqual(c.content.embedded, [{ name: 'prolific_pid', source: 'url', param: 'PROLIFIC_PID' }]);
  assert.deepEqual(byId(c, 'use_apps').options, [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]);
  assert.deepEqual(byId(c, 'app_count').displayIf, { q: 'use_apps', op: 'eq', value: 'yes' }); assert.deepEqual([byId(c, 'app_count').min, byId(c, 'app_count').max], [0, 200]);
  assert.deepEqual([byId(c, 'trust').n, byId(c, 'trust').labels.length, byId(c, 'trust').lo], [5, 5, 'Strongly disagree']);
  assert.deepEqual([byId(c, 'mood').type, byId(c, 'mood').n], ['scale', 11]);
  assert.deepEqual(byId(c, 'why').displayIf, { all: [{ q: 'use_apps', op: 'eq', value: 'yes' }, { q: 'trust', op: 'gte', value: '4' }] }); assert.equal(byId(c, 'why').long, true);
  assert.deepEqual(c.content.design.conditions.map(x => x.id), ['a', 'b']); assert.deepEqual(byId(c, 'version_a_note').conditions, ['a']);
  // the same table as .xlsx (shared strings, and inline strings) gives the same content
  for (const inline of [false, true]) {
    const x = check(run('survey-template.xlsx', makeXlsx(rows.map(r => r.map(v => (/^\d+$/.test(v) ? Number(v) : v))), { inline }).toString('base64'), { encoding: 'base64' }));
    assert.deepEqual(x.content, c.content, 'xlsx = csv' + (inline ? ' (inline strings)' : ''));
  }
  assert.equal(detectFormat('x.bin', makeXlsx([['a']])), 'sheet');
}
// CSV details: quoted commas, doubled quotes, line breaks inside quotes, CRLF, semicolons
assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n"line1\nline2",z\n'), [['a', 'b'], ['x, y', 'say "hi"'], ['line1\nline2', 'z']]);
assert.deepEqual(parseCsv('a;b\n1;2\n'), [['a', 'b'], ['1', '2']]);
{
  const csv = 'page,variable,type,text,options,required,scale_points\n1,fav,choice,"Pick one, please\nthen continue","a=Apple, red|b=""Banana""|c=Cherry",yes,\n1,rate,scale,"How ""good""?",,y,3\n';
  const r = run('q.csv', csv);
  assert.equal(byId(r, 'fav').text, 'Pick one, please\nthen continue'); assert.deepEqual(byId(r, 'fav').options.map(o => o.label), ['Apple, red', '"Banana"', 'Cherry']); assert.equal(byId(r, 'rate').n, 3);
  // show_if forms
  const s = run('q.csv', 'variable,type,text,options,show_if,condition\na,choice,A,"x=X|y=Y|z=Z",,\nb,text,B,,"a in x|y",\nc,text,C,,"a = Z or b answered",\nd,text,D,,"ed:pid != abc and a not answered",\n');
  assert.deepEqual(byId(s, 'b').displayIf, { q: 'a', op: 'in', value: ['x', 'y'] });
  assert.deepEqual(byId(s, 'c').displayIf, { any: [{ q: 'a', op: 'eq', value: 'z' }, { q: 'b', op: 'answered' }] }, 'option labels stand in for option values');
  bad(() => run('q.csv', 'variable,type,text,options,show_if\na,text,A,,\nb,text,B,,"a = x and a = y or a = z"\n'), /mixes "and" with "or"/);
  bad(() => run('q.csv', 'variable,type,text,options\na,choice,A,only one\n'), /at least two options/);
  bad(() => run('q.csv', 'variable,type,text\na,mystery,A\n'), /unknown type/);
  bad(() => run('q.csv', 'variable,type,text\n,text,A\n'), /variable name is required/);
  bad(() => run('q.csv', 'foo,bar\n1,2\n'), /Missing: variable, type, text/);
  bad(() => run('q.csv', 'variable,type,text\na,text,"unclosed\n'), /never closes/);
  // a later question can not be referenced: the importer drops the rule and says so
  const late = run('q.csv', 'variable,type,text,options,show_if\na,text,A,,"b = x"\nb,choice,B,x|y,\n');
  assert.equal(byId(late, 'a').displayIf, undefined); assert(late.report.unsupported.some(u => /does not come earlier/.test(u.what)));
}

// ================= safety and limits =================
bad(() => run('x.qsf', '{"not":"qualtrics"'), /not valid JSON/);
bad(() => run('x.qsf', '{"a":1}'), /does not look like a Qualtrics/);
bad(() => run('x.lss', '<document><questions><rows></questions></document>'), /not valid XML/);
bad(() => run('x.lss', '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;">]><document><questions>&b;</questions></document>'), /DOCTYPE or entities/);
bad(() => run('x.lss', '<document><other/></document>'), /does not look like a LimeSurvey/);
bad(() => run('x.csv', ''), /No file/);
bad(() => importSurvey({ filename: 'x.csv', data: 'variable,type,text\n' }), /No questions/);
bad(() => importSurvey(null), /No file/);
bad(() => run('x.xlsx', Buffer.from('PK\x03\x04 not really a zip').toString('base64'), { encoding: 'base64' }), /xlsx/);
bad(() => run('x.xlsx', makeZip([['hello.txt', 'hi']]).toString('base64'), { encoding: 'base64' }), /Excel workbook/);
bad(() => run('x.dat', '\u0001\u0002\u0003 binary'), /not recognized/);
bad(() => run('big.csv', 'variable,type,text\n' + 'a'.repeat(LIMITS.bytes + 10)), /MB\. Files over 5 MB/);
{
  const lines = ['variable,type,text'];
  for (let i = 0; i < 501; i++) lines.push(`v${i},text,Question ${i}`);
  bad(() => run('many.csv', lines.join('\n')), /501 questions/);
  assert.equal(run('ok.csv', lines.slice(0, 501).join('\n')).content.survey.pre.length, 500, '500 questions are fine');
}
// helper pieces
assert.equal(htmlToText('<p>A &lt;b&gt; &amp; &#65;&#x42;</p><script>evil()</script><p>Line<br/>two</p><style>x{}</style>'), 'A <b> & AB\nLine\ntwo');
assert(!/<script/i.test(htmlToText('<scr<script>ipt>alert(1)</script>ok')), 'nested tag tricks leave no script tag (the text is never used as HTML anyway)');
assert.equal(htmlToText('a < b and c > d, 1<2'), 'a < b and c > d, 1<2');
{ const t0 = Date.now(); htmlToText('<script'.repeat(200000)); htmlToText('<p>'.repeat(100000) + '&amp;'.repeat(100000)); assert(Date.now() - t0 < 1500, 'hostile HTML is processed in linear time'); }
assert.equal(htmlToText('<img src=x onerror=alert(1)>hi<iframe src=//e></iframe>'), 'hi');
assert.throws(() => parseXml('<a><b></a>'), ImportError);
assert.deepEqual(parseXml('<a x="1 &amp; 2"><b><![CDATA[<raw>]]></b><c/>t &#65;</a>').attrs, { x: '1 & 2' });
{
  const leaf = ({ left, op, right }) => ({ q: left.v, op: op === '=' ? 'eq' : 'neq', value: String(right.v) });
  assert.deepEqual(toDisplayIf(parseExpr("[a] = '1' and ([b] = '2' or [c] <> '3')", { brackets: true }), leaf), { all: [{ q: 'a', op: 'eq', value: '1' }, { any: [{ q: 'b', op: 'eq', value: '2' }, { q: 'c', op: 'neq', value: '3' }] }] });
  assert.throws(() => parseExpr('datediff([a],[b])', { brackets: true }), Unsupported);
  assert.throws(() => parseExpr('Q1 + 2 == 3'), Unsupported);
  assert.throws(() => toDisplayIf(parseExpr('A == 1 and (B == 2 or (C == 3 and (D == 4 or E == 5)))'), l => ({ q: l.left.v, op: 'eq', value: '1' })), Unsupported, 'nested too deeply');
}
console.log('importers: QSF, LSS, REDCap, CSV, xlsx, template, safety and limits');
console.log('ALL IMPORT TESTS PASSED');
