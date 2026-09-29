import { ballotOrder } from './voting.service.js';

const projects = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe('ballotOrder', () => {
  it('lists every project once', () => {
    expect(ids(ballotOrder('ballot-a', projects)).sort()).toEqual(ids(projects));
  });

  it('is the same for the same ballot, whatever order the projects arrive in', () => {
    const once = ids(ballotOrder('ballot-a', projects));
    expect(ids(ballotOrder('ballot-a', [...projects].reverse()))).toEqual(once);
  });

  it('differs between ballots', () => {
    const orders = new Set(
      ['ballot-a', 'ballot-b', 'ballot-c', 'ballot-d'].map((b) =>
        ids(ballotOrder(b, projects)).join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('does not change the list it is given', () => {
    const input = [...projects];
    ballotOrder('ballot-a', input);
    expect(input).toEqual(projects);
  });
});
