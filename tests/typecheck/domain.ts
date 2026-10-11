import type { AudienceVerdict, JudgesVerdict, AdvancementDecision, PrizeObligation } from '../../packages/contracts/src/domain.js';
import type { Identifier } from '../../packages/contracts/src/validation.js';
import type { Money } from '../../packages/contracts/src/money.js';
import type { ReferenceOf } from '../../packages/contracts/src/snapshot.js';

type AssertFalse<T extends false> = T;
export type AudienceIsNotJudges = AssertFalse<AudienceVerdict extends JudgesVerdict ? true : false>;
export type JudgesIsNotAudience = AssertFalse<JudgesVerdict extends AudienceVerdict ? true : false>;
export type AdvancementIsNotObligation = AssertFalse<AdvancementDecision extends PrizeObligation ? true : false>;
export type ObligationIsNotAdvancement = AssertFalse<PrizeObligation extends AdvancementDecision ? true : false>;
export type TenantIsNotEvent = AssertFalse<Identifier<'tenant'> extends Identifier<'event'> ? true : false>;
export type AmountIsNotFloat = AssertFalse<Money['minorUnits'] extends number ? true : false>;
export type ReferencesAreDistinct = AssertFalse<ReferenceOf<'audience-verdict'> extends ReferenceOf<'judges-verdict'> ? true : false>;
