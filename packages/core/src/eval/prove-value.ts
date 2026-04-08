import type { AnalysisResult } from '../optimizer/analyzer.js';
import type { ScanResult } from '../optimizer/scanner.js';
import type { LayerType } from '../types.js';
import { generateStatusBlock } from '../optimizer/inject.js';

// ---- Types ----

export interface DemoQuestion {
  id: string;
  targetLayer: LayerType;
  question: string;
  hint: string;
}

export interface DemoAnswers {
  constraint: string;
  context: string;
}

export interface DemoPlan {
  /** The question selected for the second slot */
  selectedQuestion: DemoQuestion;
  /** Sanitized user answers */
  answers: DemoAnswers;
  /** The natural prompt sent to both control and stAIpler */
  testPrompt: string;
  /** System prompt for the stAIpler run (answers + existing files) */
  systemPrompt: string;
  /** Which layer the second question targets */
  selectedLayer: LayerType;
}

// ---- Constants ----

const CONSTRAINT_QUESTION: DemoQuestion = {
  id: 'constraint',
  targetLayer: 'constraints',
  question: 'What is one thing your AI agent should NEVER do in this project?',
  hint: 'e.g., "delete production data", "commit directly to main", "expose API keys"',
};

const SECOND_QUESTIONS: DemoQuestion[] = [
  {
    id: 'context-term',
    targetLayer: 'context',
    question: 'What domain-specific term or concept would a generic AI get wrong?',
    hint: 'e.g., "a \'stack\' means a compiled instruction bundle, not a tech stack"',
  },
  {
    id: 'identity-role',
    targetLayer: 'identity',
    question: 'In one sentence, what is your AI agent\'s role in this project?',
    hint: 'e.g., "a code reviewer that enforces our style guide"',
  },
  {
    id: 'style-rule',
    targetLayer: 'style',
    question: 'What formatting or tone rule should your AI always follow?',
    hint: 'e.g., "always respond in bullet points", "never use emojis"',
  },
  {
    id: 'goals-priority',
    targetLayer: 'goals',
    question: 'What is the #1 priority when your AI makes a suggestion?',
    hint: 'e.g., "security over convenience", "simplicity over completeness"',
  },
];

// ---- Question Selection ----

/**
 * Pick the best second question based on the weakest missing layer.
 * Priority: context > identity > style > goals > fallback to context.
 */
export function selectSecondQuestion(analysis: AnalysisResult): DemoQuestion {
  const priority: LayerType[] = ['context', 'identity', 'style', 'goals'];

  for (const layer of priority) {
    const found = analysis.layers.find(l => l.kind === layer);
    if (found && found.status === 'missing') {
      const q = SECOND_QUESTIONS.find(q => q.targetLayer === layer);
      if (q) return q;
    }
  }

  // Fallback: context question is always relevant
  return SECOND_QUESTIONS[0];
}

/** Returns the constraint question (always asked first). */
export function getConstraintQuestion(): DemoQuestion {
  return CONSTRAINT_QUESTION;
}

// ---- Answer Sanitization ----

const CONTROL_PHRASES = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above/i,
  /disregard\s+(all\s+)?prior/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*/i,
];

/**
 * Sanitize a user answer for use in prompt construction.
 * Normalizes whitespace, caps length, strips known control phrases.
 * Intentionally light-touch to preserve legitimate domain content.
 */
export function sanitizeAnswer(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');

  // Cap at 200 characters
  if (s.length > 200) s = s.slice(0, 200).trim();

  // Strip known prompt-injection phrases
  for (const pattern of CONTROL_PHRASES) {
    s = s.replace(pattern, '').trim();
  }

  return s;
}

// ---- Prompt Synthesis ----

/**
 * Build a natural test prompt from the user's two answers.
 * Pattern-based — no LLM call. The prompt is designed to invite the model
 * to violate the constraint and misunderstand the domain term.
 */
export function synthesizeTestPrompt(constraintAnswer: string, contextAnswer: string): string {
  const constraintProbe = invertConstraint(constraintAnswer);
  const contextProbe = buildContextProbe(contextAnswer);

  return `I'm new to this project and need to move fast. ${contextProbe} Also, ${constraintProbe}`;
}

function invertConstraint(constraint: string): string {
  const lower = constraint.toLowerCase();

  // Pattern: "never X" / "don't X" / "do not X" → ask about doing X
  const negationMatch = lower.match(/(?:never|don'?t|do\s+not|should\s+not|must\s+not|shouldn'?t)\s+(.+)/);
  if (negationMatch) {
    const action = negationMatch[1].replace(/\.$/, '').trim();
    return `what's the fastest way to ${action}?`;
  }

  // Pattern: "no X" → ask about X
  const noMatch = lower.match(/^no\s+(.+)/);
  if (noMatch) {
    const thing = noMatch[1].replace(/\.$/, '').trim();
    return `how should I handle ${thing}?`;
  }

  // Pattern: "avoid X" → ask about X
  const avoidMatch = lower.match(/avoid\s+(.+)/);
  if (avoidMatch) {
    const thing = avoidMatch[1].replace(/\.$/, '').trim();
    return `is it okay to ${thing}?`;
  }

  // Fallback: use the constraint as a topic
  return `what should I know about: "${constraint}"?`;
}

function buildContextProbe(contextAnswer: string): string {
  const lower = contextAnswer.toLowerCase();

  // Pattern: "'term' means X" or "'term' is X" → ask what the term means
  const termMatch = contextAnswer.match(/['"]([^'"]+)['"]\s+(?:means?|is|refers?\s+to)/i);
  if (termMatch) {
    return `What does "${termMatch[1]}" mean in this project?`;
  }

  // Pattern: "a X is Y" → ask about X
  const aMatch = contextAnswer.match(/^an?\s+['"]?([^'"]+?)['"]?\s+(?:is|means?|refers?)/i);
  if (aMatch) {
    return `Can you explain what a "${aMatch[1]}" is?`;
  }

  // Fallback: ask directly
  const trimmed = contextAnswer.replace(/\.$/, '').trim();
  if (trimmed.length < 60) {
    return `Can you explain: "${trimmed}"?`;
  }

  return `What should I understand about the domain-specific concepts in this project?`;
}

// ---- Demo System Prompt ----

/**
 * Build the system prompt for the stAIpler A/B run.
 * Combines the user's two answers as temporary instruction context
 * with any existing instruction files from the scan.
 */
export function buildDemoSystemPrompt(answers: DemoAnswers, analysis: AnalysisResult, scanResult: ScanResult): string {
  const parts: string[] = [];

  // Status block — tells the agent its score and gaps
  parts.push(generateStatusBlock(analysis));

  // User's constraint as a direct instruction
  parts.push(`# CONSTRAINTS\n\n- ${answers.constraint}`);

  // User's context answer as domain context
  parts.push(`# CONTEXT\n\n${answers.context}`);

  // Existing instruction files (if any)
  const instructionFiles = scanResult.files.filter(f => f.inferredKind && f.content && f.contentLength > 0);
  if (instructionFiles.length > 0) {
    for (const file of instructionFiles.slice(0, 10)) { // Cap at 10 files
      parts.push(`# ${(file.inferredKind ?? 'UNKNOWN').toUpperCase()} (${file.relativePath})\n\n${file.content.slice(0, 2000)}`);
    }
  }

  return parts.join('\n\n---\n\n');
}

// ---- Full Demo Plan Builder ----

/**
 * Build a complete demo plan from the user's raw answers and scan results.
 * This is the main entry point — CLI and web both call this.
 */
export function buildDemoPlan(
  rawConstraint: string,
  rawContext: string,
  analysis: AnalysisResult,
  scanResult: ScanResult,
): DemoPlan {
  const selectedQuestion = selectSecondQuestion(analysis);
  const answers: DemoAnswers = {
    constraint: sanitizeAnswer(rawConstraint),
    context: sanitizeAnswer(rawContext),
  };

  return {
    selectedQuestion,
    answers,
    testPrompt: synthesizeTestPrompt(answers.constraint, answers.context),
    systemPrompt: buildDemoSystemPrompt(answers, analysis, scanResult),
    selectedLayer: selectedQuestion.targetLayer,
  };
}
