import {
  lockedQuestionChanges,
  questionProblems,
  type QuestionSpec,
  type StoredQuestion,
} from './question-rules.js';

const q = (over: Partial<QuestionSpec> = {}): QuestionSpec => ({
  id: null,
  prompt: 'What did you build?',
  required: false,
  isPublic: false,
  ...over,
});

const stored = (over: Partial<StoredQuestion> = {}): StoredQuestion => ({
  id: 'q1',
  prompt: 'What did you build?',
  required: false,
  isPublic: false,
  answers: 0,
  unansweredSubmitted: 0,
  ...over,
});

describe('questionProblems', () => {
  it('accepts new and kept questions with distinct prompts', () => {
    expect(questionProblems([q({ id: 'q1' }), q({ prompt: 'Who?' })], new Set(['q1']))).toEqual([]);
  });

  it('refuses a blank prompt', () => {
    expect(questionProblems([q({ prompt: '' })], new Set())).toEqual(['a question needs a prompt']);
  });

  it('refuses the same prompt twice, whatever the case', () => {
    expect(questionProblems([q(), q({ prompt: 'WHAT did you build?' })], new Set())).toEqual([
      '"WHAT did you build?" is asked twice',
    ]);
  });

  it('refuses an id that is not one of the event’s questions', () => {
    expect(questionProblems([q({ id: 'elsewhere' })], new Set(['q1']))).toEqual([
      'no question elsewhere in this event',
    ]);
  });

  it('refuses one stored question listed twice', () => {
    expect(
      questionProblems([q({ id: 'q1' }), q({ id: 'q1', prompt: 'Other' })], new Set(['q1'])),
    ).toEqual(['question q1 is listed twice']);
  });
});

describe('lockedQuestionChanges', () => {
  it('allows anything before anyone answers or submits', () => {
    expect(
      lockedQuestionChanges(
        [stored()],
        [q({ id: 'q1', prompt: 'Reworded', required: true, isPublic: true }), q({ prompt: 'New' })],
        0,
      ),
    ).toEqual([]);
  });

  it('removes an unanswered question', () => {
    expect(lockedQuestionChanges([stored()], [], 3)).toEqual([]);
  });

  it('keeps an answered question from being removed', () => {
    expect(lockedQuestionChanges([stored({ answers: 2 })], [], 0)).toEqual([
      '"What did you build?" has 2 answers and cannot be removed',
    ]);
  });

  it('lets answered questions be reworded, made optional or made private', () => {
    expect(
      lockedQuestionChanges(
        [stored({ answers: 4, required: true, isPublic: true })],
        [q({ id: 'q1', prompt: 'What did you make?' })],
        4,
      ),
    ).toEqual([]);
  });

  it('never publishes answers given in private', () => {
    expect(
      lockedQuestionChanges([stored({ answers: 1 })], [q({ id: 'q1', isPublic: true })], 0),
    ).toEqual(['"What did you build?" was answered in private, so it cannot be made public']);
  });

  it('makes a question required only when every submitted entry answered it', () => {
    expect(
      lockedQuestionChanges(
        [stored({ answers: 3, unansweredSubmitted: 0 })],
        [q({ id: 'q1', required: true })],
        3,
      ),
    ).toEqual([]);
    expect(
      lockedQuestionChanges(
        [stored({ answers: 2, unansweredSubmitted: 1 })],
        [q({ id: 'q1', required: true })],
        3,
      ),
    ).toEqual([
      '"What did you build?" cannot become required: 1 submitted entry has no answer to it',
    ]);
  });

  it('adds a required question only before anything is submitted', () => {
    expect(lockedQuestionChanges([], [q({ required: true })], 0)).toEqual([]);
    expect(lockedQuestionChanges([], [q({ required: false })], 5)).toEqual([]);
    expect(lockedQuestionChanges([], [q({ required: true })], 5)).toEqual([
      '"What did you build?" cannot be added as required: 5 submitted entries have no answer',
    ]);
  });
});
