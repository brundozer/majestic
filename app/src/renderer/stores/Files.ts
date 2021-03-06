import { TestFileAssertionStatus } from "jest-editor-support";
import { observable, IObservableArray, computed, action } from "mobx";
import TreeNode from "../stores/TreeNode";
import { TestReconcilationState } from "jest-editor-support";
import getLabel, { getTestStatusLabel } from "../components/tree-node-label";
import { filterFiles, filterTree } from "../util/search";
import { Coverage } from "./Coverage";
import { TotalResult } from "./TotalResult";
import CoverageSummary from "./CoverageSummary";
import ItBlockWithStatus from "../types/it-block";

// wiretap("App");

export default class Files {
  @observable files: IObservableArray<TreeNode> = observable([]);
  @observable tests: IObservableArray<TreeNode> = observable([]);
  @observable text: string = "";
  @observable testsOnly: boolean = true;
  @observable totalResult = new TotalResult();
  @observable totalCoverage = new CoverageSummary();

  // A flat map of all the nodes of the directory tree.
  // We use this to perform updates on the tree nodes.
  @observable nodes: Map<string, TreeNode> = new Map();
  @observable coverageNodes: Map<string, TreeNode> = new Map();

  @action
  initialize(tests: TreeNode[], nodes: Map<string, TreeNode>) {
    const rootNode = new TreeNode();
    rootNode.label = "root";
    rootNode.childNodes = tests;
    const filtered = filterTree(rootNode);

    this.tests.clear();
    this.tests.push(...filtered.childNodes);

    nodes.forEach((value: TreeNode, key: string) => {
      this.nodes.set(key, value);
    });
  }

  @action
  initializeCoverageFiles(files: TreeNode[], nodes: Map<string, TreeNode>) {
    this.files.clear();
    this.files.push(...files);

    this.coverageNodes.clear();
    nodes.forEach((value: TreeNode, key: string) => {
      this.coverageNodes.set(key, value);
    });
  }

  getNodeByPath(path: string) {
    const testFile = this.nodes.get(path);
    if (testFile) {
      return testFile;
    }

    return this.coverageNodes.get(path);
  }

  @action
  updateWithAssertionStatus(tests: TestFileAssertionStatus[]) {
    this.resetStatus();
    tests.map(test => {
      const nodeToUpdate = this.nodes.get(test.file);
      if (nodeToUpdate) {
        nodeToUpdate.setToFileIcon();
        nodeToUpdate.status = test.status as TestReconcilationState;
        nodeToUpdate.output = test.message;
        nodeToUpdate.secondaryLabel = getTestStatusLabel(test.status);

        for (const assertion of test.assertions) {
          const itBlock = nodeToUpdate.itBlocks.find(
            it => it.name === assertion.title
          );

          if (itBlock) {
            itBlock.status = assertion.status;
            itBlock.assertionMessage = assertion.message;
            itBlock.isExecuting = false;
            itBlock.snapshotErrorStatus = assertion.message.includes(
              "stored snapshot"
            )
              ? "error"
              : "unknown";
          }
        }
      }
    });
  }

  @action
  updateCoverage(coverage: Coverage) {
    for (const node of this.nodes.values()) {
      if (!node.isTest) {
        const coverageForFile = coverage.getCoverageForFile(node.path);
        if (coverageForFile) {
          const coverageSummary = coverageForFile.toSummary();
          node.coverage.branchesPercentage = coverageSummary.branches.pct;
          node.coverage.linePercentage = coverageSummary.lines.pct;
          node.coverage.functionPercentage = coverageSummary.functions.pct;
          node.coverage.statementPercentage = coverageSummary.statements.pct;

          node.secondaryLabel = getLabel(`${coverageSummary.lines.pct}%`);
        }
      }
    }

    const summary = coverage.getSummary();
    this.totalCoverage.branchesPercentage = summary.branchesPercentage;
    this.totalCoverage.functionPercentage = summary.functionPercentage;
    this.totalCoverage.linePercentage = summary.linePercentage;
    this.totalCoverage.statementPercentage = summary.statementPercentage;
  }

  @action
  updateTotalResult(result) {
    this.totalResult.numPassedTestSuites = result.numPassedTestSuites;
    this.totalResult.numFailedTestSuites = result.numFailedTestSuites;
    this.totalResult.numPassedTests = result.numPassedTests;
    this.totalResult.numFailedTests = result.numFailedTests;
    this.totalResult.matchedSnaphots = result.snapshot.matched;
    this.totalResult.unmatchedSnapshots = result.snapshot.unmatched;
  }

  // Toggles spin animation in all the nodes by switching the class
  @action
  toggleStatusToAll() {
    this.resetStatus();

    this.nodes.forEach((node: TreeNode) => {
      if (node.type === "file") {
        node.spin();
      }

      node.itBlocks.map(it => {
        it.isExecuting = true;
      });
    });
  }

  // Unhighlight all the nodes
  @action
  unhighlightAll() {
    this.nodes.forEach((node: TreeNode) => {
      node.isSelected = false;
    });

    this.coverageNodes.forEach((node: TreeNode) => {
      node.isSelected = false;
    });
  }

  @action
  search(text: string) {
    this.text = text;
  }

  @computed
  get allFiles() {
    if (this.text.trim() === "") {
      return this.files;
    }

    return filterFiles(this.nodes, this.text);
  }

  @computed
  get testFiles() {
    if (this.text.trim() === "") {
      return this.tests;
    }

    return filterFiles(this.nodes, this.text, node => {
      return !!(node && node.isTest);
    });
  }

  getFailedItStatements() {
    const failedTests = new Map<string, ItBlockWithStatus[]>();
    this.nodes.forEach((testFile, index) => {
      const failedTestsForFile: ItBlockWithStatus[] = [];
      testFile.itBlocks.forEach(it => {
        if (it.status === "KnownFail") {
          failedTestsForFile.push(it);
        }
      });

      if (failedTestsForFile.length > 0) {
        failedTests.set(testFile.path, failedTestsForFile);
      }
    });

    return failedTests;
  }

  @action
  clear() {
    this.files.clear();
    this.tests.clear();
  }

  // Resets previous execution status of the UI
  @action
  resetStatus() {
    this.nodes.forEach((node: TreeNode) => {
      node.setToFileIcon();
      node.itBlocks.map(it => {
        it.isExecuting = false;
        it.status = "";
      });
    });
  }
}
