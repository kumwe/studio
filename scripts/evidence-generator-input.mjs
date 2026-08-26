const FLAGS = new Map([
  ['--candidate', 'candidate'],
  ['--criteria', 'criteria'],
  ['--execution-attempt', 'executionAttempt'],
  ['--execution-id', 'executionId'],
  ['--id', 'id'],
  ['--package', 'package'],
  ['--profiles', 'profiles'],
  ['--runner', 'runner'],
]);

export function parseEvidenceArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const property = FLAGS.get(flag);
    if (property === undefined) {
      throw new Error(`Unknown evidence generator argument ${String(flag)}.`);
    }
    if (Object.hasOwn(parsed, property)) {
      throw new Error(`Evidence generator argument ${flag} may be supplied only once.`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.length === 0 || value.startsWith('--')) {
      throw new Error(`Evidence generator argument ${flag} requires a nonempty value.`);
    }
    parsed[property] = value;
  }

  if (parsed.package === undefined || parsed.criteria === undefined) {
    throw new Error(
      'Usage: node scripts/create-evidence-bundle.mjs --package <M2-01> ' +
        '--criteria <gate-a/01-id,...> [--profiles <studio.profile/id,...>] ' +
        '[--candidate <sha>] [--id <bundleId>] [--runner <identity>] ' +
        '[--execution-id <identity> --execution-attempt <number>]',
    );
  }
  if (!/^(?:M[1-6]-[0-9]{2}|ST-(?:[0-9]|1[01]))$/u.test(parsed.package)) {
    throw new Error(`Invalid work package ${parsed.package}.`);
  }
  if (parsed.candidate !== undefined && !/^[a-f0-9]{40}$/u.test(parsed.candidate)) {
    throw new Error('The candidate must be an exact lowercase 40-character commit SHA.');
  }
  if (parsed.id !== undefined) {
    if (
      parsed.id.length > 120 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(parsed.id) ||
      parsed.id.startsWith('SAMPLE-')
    ) {
      throw new Error(`Invalid or reserved bundle identifier ${parsed.id}.`);
    }
  }
  if (
    parsed.runner !== undefined &&
    (parsed.runner.length > 200 ||
      [...parsed.runner].some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
      }))
  ) {
    throw new Error('The runner identity contains a control character or exceeds 200 characters.');
  }
  if (
    parsed.executionId !== undefined &&
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/u.test(parsed.executionId)
  ) {
    throw new Error('The execution identifier must be a bounded stable identifier.');
  }
  if (
    parsed.executionAttempt !== undefined &&
    !/^(?:[1-9][0-9]{0,2}|1000)$/u.test(parsed.executionAttempt)
  ) {
    throw new Error('The execution attempt must be an integer from 1 through 1000.');
  }

  return {
    ...parsed,
    criteria: parseList(parsed.criteria, 'criteria'),
    ...(parsed.executionAttempt === undefined
      ? {}
      : { executionAttempt: Number(parsed.executionAttempt) }),
    profiles: parsed.profiles === undefined ? [] : parseList(parsed.profiles, 'profiles'),
  };
}

function parseList(value, label) {
  const values = value.split(',');
  if (
    values.length === 0 ||
    values.length > 100 ||
    values.some((item) => item.length === 0 || item !== item.trim())
  ) {
    throw new Error(`The ${label} list must contain 1-100 comma-separated values without spaces.`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`The ${label} list contains a duplicate value.`);
  }
  return values;
}
