export type MoveId = string;
export type CharacterSlot = 1 | 2 | 3;

export type InputEventType = 'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'gamepadbuttondown' | 'gamepadbuttonup';
export type HoldConversionEvent = {
  sourceCode: string;
  holdCode: string;
  pressTime: number;
  holdStartTime: number;
  releaseTime: number;
};

export type InputSource = {
  code: string;
  label: string;
};

export type TrainerInputEvent = {
  type: InputEventType;
  code: string;
  time: number;
};

export type MoveDefinition = {
  id: MoveId;
  label: string;
  color: string;
  icon?: string;
  independent: boolean;
  priority: number;
  advancesStep: boolean;
  interruptibleBy?: MoveId[];
};

export type KeyBinding = {
  moveId: MoveId;
  inputs: InputSource[];
};

export type MoveActivation = {
  move: MoveDefinition;
  input: TrainerInputEvent;
};

export type RecordedUnit = {
  id: string;
  moveId: MoveId;
  label: string;
  characterSlot?: CharacterSlot;
  lane: 'main' | 'independent';
  independent: boolean;
  startTime: number;
  endTime: number;
  duration: number;
  sourceCodes: string[];
};

export type ComboStepSample = {
  recordingId: string;
  startTime: number;
  duration: number;
};

export type ComboStep = {
  id: string;
  moveId: MoveId;
  label: string;
  characterSlot?: CharacterSlot;
  lane: 'main' | 'independent';
  independent: boolean;
  startMin: number;
  startMax: number;
  durationMin: number;
  durationMax: number;
  preheatMs?: number;
  recoveryMs?: number;
  manualFree?: boolean;
  free?: boolean;
  note?: string;
  color: string;
  advancesStep: boolean;
  samples: ComboStepSample[];
};

export type ComboPeriodKind = 'draft_period' | 'free_fire' | 'startup_axis' | 'loop_axis';

export type ComboPeriod = {
  id: string;
  kind: ComboPeriodKind;
  label: string;
  characterSlot?: CharacterSlot;
  lane?: 'main' | 'independent';
  startMs: number;
  endMs: number;
  loopIndex?: number;
};

export type ComboChart = {
  id: string;
  title: string;
  character?: string;
  author?: string;
  tags: string[];
  contentLabels?: Record<string, string>;
  timelineDurationMs?: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  startTriggerMoveId: MoveId;
  stopTriggerMoveId?: MoveId;
  steps: ComboStep[];
  periods?: ComboPeriod[];
};

export type ComboImageRoleStyle = {
  name: string;
  color: string;
  avatar?: string;
  avatarCrop?: RectPercent;
  avatarSize?: number;
  avatarOffsetX?: number;
  avatarOffsetY?: number;
  capsuleImage?: string;
  capsuleImageWidth?: number;
  capsuleImageHeight?: number;
  capsuleCrop?: RectPercent;
  capsuleStretch?: StretchPercent;
  iconMappings?: ComboIconMapping[];
};

export type RectPercent = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type StretchPercent = {
  left: number;
  right: number;
};

export type ComboIconMapping = {
  id: string;
  label: string;
  src: string;
  triggers: string[];
  iconScale?: number;
};

export type ComboBasePreset = {
  id: string;
  name: string;
  src: string;
  imageWidth?: number;
  imageHeight?: number;
  crop?: RectPercent;
  stretch?: StretchPercent;
  user?: boolean;
};

export type ComboImageStyle = {
  roleStyles: Record<CharacterSlot, ComboImageRoleStyle>;
  blockMode: 'capsule' | 'image';
  capsuleShape: 'capsule' | 'rect';
  backgroundImage?: string;
  backgroundCrop?: RectPercent;
  capsuleImage?: string;
  capsuleImageWidth?: number;
  capsuleImageHeight?: number;
  capsuleImageScale: number;
  capsuleCrop?: RectPercent;
  capsuleStretch?: StretchPercent;
  capsuleColor: string;
  useCustomCapsuleColor: boolean;
  textColor: string;
  fontSize: number;
  fontFamily: string;
  avatarSize: number;
  avatarOffsetX: number;
  avatarOffsetY: number;
  capsuleWidth: number;
  capsuleWidthMode: 'fixed' | 'auto';
  autoWidthPadding: number;
  capsuleHeight: number;
  capsuleGap: number;
  edgePadding: number;
  scrollAnchor: 'start' | 'center';
  scrollStartOffsetPx: number;
  fadeEnabled: boolean;
  fadeRange: number;
  prePromptEnabled: boolean;
  convertIcons: boolean;
  mergeSameRoleSteps: boolean;
  iconMappings: ComboIconMapping[];
  basePresets: ComboBasePreset[];
  contentLabels: Record<string, string>;
};

export type RecordingSnapshot = {
  isRecording: boolean;
  startedAt: number | null;
  elapsed: number;
  activeMain: RecordedUnit | null;
  activeIndependent: RecordedUnit[];
  units: RecordedUnit[];
};

export type PracticeMode = 'strict' | 'lenient' | 'free';

export type PracticeSettings = {
  mode: PracticeMode;
  allowEarlyMs: number;
  allowLateMs: number;
  requireDurationMin: boolean;
  requireDurationMax: boolean;
  allowExtraIndependentMoves: boolean;
  stopOnError: boolean;
  axisGateEnabled: boolean;
};

export type PracticeStatus = 'idle' | 'armed' | 'running' | 'passed' | 'failed';

export type PracticeFeedback = {
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  stepId?: string;
};

export type PracticeJudgement = 'perfect' | 'great' | 'good' | 'miss';

export type PracticeSnapshot = {
  status: PracticeStatus;
  startedAt: number | null;
  elapsedMs?: number;
  currentStepIndex: number;
  feedback: PracticeFeedback[];
  judgements?: Record<string, PracticeJudgement>;
  matchedStepIds?: string[];
  completedStepIds: string[];
  errorStepIds: string[];
};
