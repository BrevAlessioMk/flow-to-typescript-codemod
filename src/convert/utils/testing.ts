import * as recast from "recast";
import * as t from "@babel/types";
import * as recastFlowParser from "recast/parsers/flow";
import { Project, SourceFile } from "ts-morph";
import { recastOptions } from "../../runner/process-batch";
import { runTransforms } from "../../runner/run-transforms";
import MigrationReporter from "../../runner/migration-reporter";
import { defaultTransformerChain } from "../default-transformer-chain";
import { watermarkTransformRunner } from "../transform-runners";
import { Transformer } from "../transformer";
import { State } from "../../runner/state";
import { ConfigurableTypeProvider } from "./configurable-type-provider";
import { FixCommandCliArgs } from "../../cli/arguments";
import { FixCommandState } from "../../fix/state";

const MockedMigrationReporter =
  MigrationReporter as unknown as jest.Mock<MigrationReporter>;

/**
 * Runs the default set of transforms
 *
 * @param {string} code
 * @param {State} [state]
 * @return {*}
 */
const transform = async (code: string, state?: State) => {
  state = state ?? stateBuilder();

  const transforms = defaultTransformerChain;
  return transformRunner(code, state, transforms);
};

/**
 * Runs a single watermark transform
 *
 * @param {string} code
 * @param {State} [state]
 * @return {*}
 */
const watermarkTransform = async (code: string, state?: State) => {
  const filePath = "./fake/test.js";
  const isTestFile = filePath.endsWith(".test.js");
  state =
    state ??
    stateBuilder({
      config: {
        filePath,
        isTestFile,
        watermark: "@typescriptify",
        watermarkMessage: `
THIS FILE IS AUTOMATICALLY GENERATED. Do not edit this file.
If you want to manually write flow types for this file,
remove the @typescriptify annotation and this comment block.
`,
        convertJSXSpreads: false,
      },
    });

  const transforms = [watermarkTransformRunner];
  return transformRunner(code, state, transforms);
};

const transformRunner = async (
  code: string,
  state: State,
  transforms: readonly Transformer[]
) => {
  const reporter = new MigrationReporter();
  const file: t.File = recast.parse(code, {
    parser: recastFlowParser,
  });

  await runTransforms(reporter, state, file, transforms);

  return recast.print(file, recastOptions).code;
};

const expectMigrationReporterMethodCalled = (
  methodName: keyof MigrationReporter
) => {
  const didCall = MockedMigrationReporter.mock.instances.some((reporter) => {
    return (
      (reporter[methodName] as jest.Mock<MigrationReporter[typeof methodName]>)
        .mock.calls.length >= 1
    );
  });
  expect(didCall).toBe(true);
};

const expectMigrationReporterMethodNotCalled = (
  methodName: keyof MigrationReporter
) => {
  const didCall = MockedMigrationReporter.mock.instances.some((reporter) => {
    return (
      (reporter[methodName] as jest.Mock<MigrationReporter[typeof methodName]>)
        .mock.calls.length >= 1
    );
  });
  expect(didCall).toBe(false);
};

type DeepPartialOverride<T> = {
  [P in keyof T]?: DeepPartialOverride<T[P]>;
};

type StateLessConfigurableTypeProvider = DeepPartialOverride<
  Omit<State, "configurableTypeProvider">
> &
  Partial<Pick<State, "configurableTypeProvider">>;

const stateBuilder = (
  stateOverrides: StateLessConfigurableTypeProvider = {}
): State => {
  const filePath = "./fake/test.js";
  const isTestFile = filePath.endsWith(".test.js");
  const typeProvider =
    stateOverrides.configurableTypeProvider ??
    new ConfigurableTypeProvider({
      useStrictAnyFunctionType: false,
      useStrictAnyObjectType: false,
    });

  return {
    hasJsx: false,
    usedUtils: false,
    ...stateOverrides,
    config: {
      filePath,
      isTestFile,
      watermark: "",
      watermarkMessage: "",
      convertJSXSpreads: false,
      dropImportExtensions: false,
      keepPrivateTypes: false,
      forceTSX: false,
      disableFlow: false,
      ...stateOverrides.config,
    },
    configurableTypeProvider: typeProvider,
  };
};

type ResultDictionary = { [filename: string]: string };

export function createOutputRecorder(): [
  ResultDictionary,
  (file: SourceFile) => void
] {
  const results: ResultDictionary = {};

  function recordResult(file: SourceFile) {
    results[file.getBaseName()] = file.getFullText();
  }

  return [results, recordResult];
}

const getTestFixState = (argv: FixCommandCliArgs): FixCommandState => {
  const migrationReporter = new MigrationReporter();
  const project = new Project({
    tsConfigFilePath: argv.config,
  });

  return { argv, migrationReporter, project };
};

export {
  transform,
  watermarkTransform,
  expectMigrationReporterMethodCalled,
  expectMigrationReporterMethodNotCalled,
  stateBuilder,
  MockedMigrationReporter,
  getTestFixState,
};