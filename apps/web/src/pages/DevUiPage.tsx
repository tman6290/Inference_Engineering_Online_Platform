import type { Confidence } from '@forward-pass/shared';
import { useState, type ReactNode } from 'react';
import { PageHeader } from '../shell/PageHeader';
import {
  AnswerOption,
  ArrowLeftIcon,
  ArrowRightIcon,
  BoltIcon,
  BookIcon,
  Button,
  ButtonLink,
  Card,
  CheckIcon,
  CheckpointIcon,
  Chip,
  CloseIcon,
  ConfidencePills,
  Eyebrow,
  HomeIcon,
  Input,
  LockIcon,
  LogoMark,
  MenuIcon,
  MoonIcon,
  NoteIcon,
  ProgressBar,
  ProgressIcon,
  ProjectIcon,
  RetryIcon,
  SearchIcon,
  SegmentedProgress,
  StatTile,
  SunIcon,
  Textarea,
  Toggle,
  type ChipStatus,
  type SegmentState,
} from '../ui';
import styles from './DevUiPage.module.css';

const chipStatuses: { status: ChipStatus; text: string }[] = [
  { status: 'accepted', text: 'Accepted' },
  { status: 'done', text: 'Done' },
  { status: 'retry', text: 'Retry · accepted' },
  { status: 'reading', text: 'Reading' },
  { status: 'upNext', text: 'Up next' },
  { status: 'queued', text: 'Queued' },
  { status: 'public', text: 'Public · 91' },
  { status: 'private', text: 'Private · 78' },
];

const segments: SegmentState[] = [
  'accepted',
  'accepted',
  'retry',
  'accepted',
  'current',
  'empty',
  'empty',
  'empty',
  'empty',
  'empty',
];

const icons = [
  ['Home', HomeIcon],
  ['Book', BookIcon],
  ['Checkpoint', CheckpointIcon],
  ['Project', ProjectIcon],
  ['Progress', ProgressIcon],
  ['Search', SearchIcon],
  ['ArrowRight', ArrowRightIcon],
  ['ArrowLeft', ArrowLeftIcon],
  ['Moon', MoonIcon],
  ['Sun', SunIcon],
  ['Bolt', BoltIcon],
  ['Menu', MenuIcon],
  ['Close', CloseIcon],
  ['Check', CheckIcon],
  ['Retry', RetryIcon],
  ['Lock', LockIcon],
  ['Note', NoteIcon],
  ['Logo', LogoMark],
] as const;

function Demo({ title, children }: { title: string; children: ReactNode }) {
  const id = `demo-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section aria-labelledby={id} className={styles.demo}>
      <h2 id={id} className={styles.demoTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Pair({ children }: { children: (surface: 'paper' | 'dark') => ReactNode }) {
  return (
    <div className={styles.pair}>
      <Card className={styles.surface}>
        <Eyebrow>On paper</Eyebrow>
        {children('paper')}
      </Card>
      <Card variant="dark" className={styles.surface}>
        <Eyebrow>On dark</Eyebrow>
        {children('dark')}
      </Card>
    </div>
  );
}

export function DevUiPage() {
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [answer, setAnswer] = useState('a');
  const [toggleOn, setToggleOn] = useState(true);
  const [toggleOff, setToggleOff] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Dev only"
        title="UI primitives"
        description="Every primitive in every state. Toggle the theme to check the dark reading set."
      />

      <div className={styles.stack}>
        <Demo title="Button">
          <Pair>
            {(surface) => (
              <div className={styles.row}>
                {surface === 'paper' ? (
                  <>
                    <Button>Primary on paper</Button>
                    <Button arrow>With arrow</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="ghost">Ghost</Button>
                    <ButtonLink to="/dev/ui" variant="secondary" arrow>
                      As a link
                    </ButtonLink>
                    <Button disabled>Disabled</Button>
                    <Button variant="secondary" disabled>
                      Disabled
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="onDark">Primary on dark</Button>
                    <Button variant="ghost">Ghost</Button>
                    <ButtonLink to="/dev/ui" variant="onDark">
                      As a link
                    </ButtonLink>
                    <Button variant="onDark" disabled>
                      Disabled
                    </Button>
                    <Button variant="ghost" disabled>
                      Disabled
                    </Button>
                  </>
                )}
              </div>
            )}
          </Pair>
          <Button block>Block width</Button>
        </Demo>

        <Demo title="Chip">
          <Pair>
            {() => (
              <div className={styles.row}>
                {chipStatuses.map((chip) => (
                  <Chip key={chip.status} status={chip.status}>
                    {chip.text}
                  </Chip>
                ))}
              </div>
            )}
          </Pair>
        </Demo>

        <Demo title="ProgressBar">
          <Pair>
            {() => (
              <div className={styles.column}>
                <ProgressBar label="Decode progress" value={0} />
                <ProgressBar label="Decode progress" value={41} />
                <ProgressBar label="Section" value={38} valueText="38% · ~12 min left" />
                <ProgressBar label="Complete" value={100} />
                <ProgressBar label="Label hidden" value={62} hideLabel />
                <SegmentedProgress label="Checkpoint 5.2" segments={segments} />
                <SegmentedProgress
                  label="Fresh checkpoint"
                  segments={Array<SegmentState>(10).fill('empty')}
                />
              </div>
            )}
          </Pair>
        </Demo>

        <Demo title="StatTile">
          <div className={styles.grid4}>
            <StatTile
              label="Decode progress"
              value="41%"
              caption="17 of 42 sections read"
              progress={41}
            />
            <StatTile
              label="Acceptance rate"
              value="83%"
              caption="checkpoint answers accepted first try"
              progress={83}
            />
            <StatTile
              label="Projects shipped"
              value="2"
              unit="/7"
              caption="both portfolio-ready"
              footer={<a href="#demo-stattile">Open Project 05</a>}
            />
            <StatTile label="This week" value="3h 40m" caption="goal 5h · on pace" dark />
          </div>
        </Demo>

        <Demo title="Card">
          <div className={styles.grid4}>
            <Card>
              <Eyebrow>Paper</Eyebrow>
              <p className={styles.cardText}>Default reading surface.</p>
            </Card>
            <Card variant="dark">
              <Eyebrow tone="accent">Dark</Eyebrow>
              <p className={styles.cardText}>The machine talking.</p>
            </Card>
            <Card variant="tinted">
              <Eyebrow>Tinted</Eyebrow>
              <p className={styles.cardText}>Asides like the duel rules.</p>
            </Card>
            <Card variant="dashed">
              <Eyebrow>Dashed</Eyebrow>
              <p className={styles.cardText}>Not started yet.</p>
            </Card>
          </div>
        </Demo>

        <Demo title="Eyebrow">
          <Pair>
            {() => (
              <div className={styles.column}>
                <Eyebrow>Mute · Chapter 5 · Techniques</Eyebrow>
                <Eyebrow tone="accent">Accent · Continue decoding</Eyebrow>
              </div>
            )}
          </Pair>
        </Demo>

        <Demo title="ConfidencePills">
          <div className={styles.column}>
            <ConfidencePills
              legend="How solid is this section for you? (interactive)"
              value={confidence}
              onChange={setConfidence}
            />
            <ConfidencePills legend="Shaky selected" value="shaky" name="c-shaky" />
            <ConfidencePills legend="Okay selected" value="okay" name="c-okay" />
            <ConfidencePills legend="Solid selected" value="solid" name="c-solid" />
            <ConfidencePills legend="Disabled" value="okay" name="c-disabled" disabled />
          </div>
        </Demo>

        <Demo title="AnswerOption">
          <div className={styles.answers}>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Interactive: pick one</legend>
              {['a', 'b', 'c'].map((value, index) => (
                <AnswerOption
                  key={value}
                  letter={value.toUpperCase()}
                  label={
                    ['Time to first token', 'Tokens per second during decode', 'Both equally'][
                      index
                    ]!
                  }
                  name="demo-answer"
                  value={value}
                  checked={answer === value}
                  onChange={() => setAnswer(value)}
                />
              ))}
            </fieldset>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Graded states</legend>
              <AnswerOption letter="A" label="Idle option" name="demo-graded" value="a" />
              <AnswerOption
                letter="B"
                label="Accepted"
                name="demo-graded"
                value="b"
                state="accepted"
                defaultChecked
              />
              <AnswerOption
                letter="C"
                label="Rejected, try again"
                name="demo-graded"
                value="c"
                state="rejected"
              />
              <AnswerOption letter="D" label="Disabled" name="demo-graded" value="d" disabled />
            </fieldset>
          </div>
        </Demo>

        <Demo title="Input and Textarea">
          <div className={styles.grid2}>
            <Input label="Default" placeholder="Search the book or glossary" />
            <Input label="With hint" hint="Your repo must be public or shared with the grader." />
            <Input label="With error" defaultValue="not-a-url" error="Enter a full https:// URL." />
            <Input label="Disabled" defaultValue="Locked" disabled />
            <Textarea label="Your notes" placeholder="Temperature kills acceptance rate." />
            <Textarea
              label="Teach-back"
              hint="Three minutes on the questions you missed."
              error="Add at least one sentence."
            />
          </div>
        </Demo>

        <Demo title="Toggle">
          <div className={styles.column}>
            <Toggle label="On" checked={toggleOn} onChange={setToggleOn} />
            <Toggle
              label="Off, with description"
              description="Show hints before the first attempt."
              checked={toggleOff}
              onChange={setToggleOff}
            />
            <Toggle label="Disabled on" checked disabled />
            <Toggle label="Disabled off" checked={false} disabled />
          </div>
        </Demo>

        <Demo title="Icons">
          <ul className={styles.icons}>
            {icons.map(([name, Icon]) => (
              <li key={name} className={styles.icon}>
                <Icon size={24} />
                <span>{name}</span>
              </li>
            ))}
          </ul>
        </Demo>
      </div>
    </>
  );
}
