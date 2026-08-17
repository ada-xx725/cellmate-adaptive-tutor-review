# CellMate Adaptive Next Step 源码导读

> TypeScript 零基础版
> 对应代码快照：`cellmate-adaptive-workflow` 分支，`cd95b1b`（完整提交 `cd95b1ba3599a9f41346f2aea028bae3a601447a`）
> 更新时间：2026-08-16
> 路径约定：文中的 `<repository-root>` 表示本仓库的检出目录。所有 Markdown 相对链接均以本文件所在的 `cellmate-plugin\docs` 为基准。

这份文档不是普通的功能说明，而是一份“带你读源码”的教程。它假设你会一点 Python，但基本不会 TypeScript，也不熟悉 VS Code 扩展。

读完以后，你应该能够：

1. 说清楚插件从哪里启动；
2. 看懂项目中最常见的 TypeScript 写法；
3. 沿着代码解释一次 `Adaptive Next Step` 点击；
4. 区分题目、证据、学习者状态、动作、反馈和 trace；
5. 解释四个评估条件以及模拟评估为什么不是真实模型结果；
6. 知道某类问题应当去哪个文件排查；
7. 修改源码时不误改编译产物、评估结果或课程子模块。

---

## 0. 先记住一条主线

整个自适应功能可以压缩成五个词：

```text
题目 → 证据 → 学习者状态/历史 → 教学动作 → 可审计记录
```

展开以后是：

```text
Notebook 代码单元格
  ↓
TaskSpec：当前到底在做什么题
  ↓
TestEvidence：明确检查证明了什么
  ↓
LearnerState + AttemptRecord[]：以前学得怎样、得到过什么帮助
  ↓
DecisionResult：需要更多证据，或六个动作之一
  ↓
反馈 / 提示 / 课程推荐 / 生成题
  ↓
Store + DecisionTrace + Notebook 输出
```

你以后看到任何文件，都先问：

- 它是在确定题目吗？
- 它是在收集证据吗？
- 它是在读取或更新状态吗？
- 它是在选择动作吗？
- 它是在生成、保存或展示结果吗？

只要能回答这个问题，就不会在几十个文件里迷路。

---

## 1. 仓库地图：哪些代码属于什么

项目根目录是：

```text
<repository-root>
```

和本功能最相关的结构如下：

```text
irp-xx725/
├─ adaptive_coach/                 早期 Python 原型
├─ external/
│  └─ introduction-to-python/      外部课程 Git 子模块
├─ tests/                          根目录 Python 原型测试
└─ cellmate-plugin/                当前真正运行的 VS Code 插件
   ├─ package.json                 插件元数据、命令、配置、npm 脚本
   ├─ tsconfig.json                生产 TypeScript 编译设置
   ├─ tsconfig.evaluation.json     评估 TypeScript 编译设置
   ├─ src/
   │  ├─ extension.ts              整个插件的激活入口
   │  ├─ llmConfiguration.ts       LLM 配置的纯逻辑
   │  ├─ llmTransport.ts           共用 HTTP/JSON 传输
   │  ├─ workspaceLlmConfiguration.ts 读取 VS Code 设置
   │  └─ adaptive/                 你的自适应生产功能
   │     └─ core/                  不依赖 VS Code 的决策核心
   ├─ evaluation/                  离线评估、judge、统计和模拟
   ├─ resources/                   课程 manifest、评估集合等资源
   ├─ test/                        Node 测试
   ├─ out/                         生产编译产物，不要手改
   ├─ out-evaluation/              评估编译产物，不要手改
   └─ node_modules/                安装的依赖，不要手改
```

### 1.1 当前生产功能和早期原型的区别

根目录的 `adaptive_coach/*.py` 是早期 Python 原型。它帮助形成了自适应策略的概念，但当前学生点击 VS Code 按钮时，并不会调用这个 Python 包。

当前真实路径是：

```text
package.json
  → out/extension.js
  → 源码 src/extension.ts
  → registerAdaptiveNextStep(ctx)
  → src/adaptive/adaptiveNextStep.ts
```

Python 在当前产品中仍有用途：`PythonValidator` 会启动 Python 进程执行学生代码和明确测试。但“整个自适应控制流程”已经是 TypeScript。

### 1.2 原始 CellMate 与你的新增模块

`src/extension.ts` 很大，其中反馈、Error Helper、聊天、录音等大部分是原 CellMate 功能。你的 IRP 主线集中在：

- `src/adaptive/**`；
- `src/llmConfiguration.ts`；
- `src/llmTransport.ts`；
- `src/workspaceLlmConfiguration.ts`；
- `evaluation/**`；
- 与上述模块对应的 `test/**`。

因此你不需要先读完九百多行 `extension.ts`。只要先找到它的 `activate`：

```ts
export function activate(ctx: vscode.ExtensionContext) {
  setExtensionContext(ctx);
  registerAdaptiveNextStep(ctx);
  // 后面还有原 CellMate 的其他功能
}
```

这行 `registerAdaptiveNextStep(ctx)` 就是进入你项目主线的门。

### 1.3 哪些目录不要手改

| 目录或文件 | 原因 |
|---|---|
| `out/` | `npm run compile` 自动从 `src` 生成 |
| `out-evaluation/` | `npm run compile:eval` 自动生成 |
| `node_modules/` | npm 安装的第三方依赖 |
| `evaluation/results/` | 运行产生的结果，不是源代码 |
| `external/introduction-to-python/` | 独立 Git 子模块，不能当普通目录随便提交 |
| `.env`、API key | 敏感信息绝不能进入 Git |

正确修改方式是：

```text
修改 src 或 evaluation 下的源文件
  → 运行 compile
  → 运行测试
  → 检查 Git diff
```

---

## 2. TypeScript 是怎样变成插件的

### 2.1 TypeScript 与 JavaScript 的关系

TypeScript 可以理解为“带静态类型检查的 JavaScript”。VS Code 最终运行的是 JavaScript，不会直接运行 `.ts` 文件。

项目的 `tsconfig.json` 告诉编译器：

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es6",
    "outDir": "out",
    "rootDir": "src",
    "strict": true
  },
  "include": ["src/**/*.ts"]
}
```

逐项翻译：

- `rootDir: "src"`：源码从 `src` 读取；
- `outDir: "out"`：编译后的 JavaScript 放进 `out`；
- `strict: true`：严格检查可能的 `undefined`、错误类型等；
- `module: "commonjs"`：使用 Node/VS Code 能加载的模块格式。

所以：

```text
src/adaptive/policy.ts
        ↓ npm run compile
out/adaptive/policy.js
```

### 2.2 为什么测试文件是 JavaScript

测试例如：

```js
const { DecisionEngine } =
  require("../out/adaptive/core/decisionEngine");
```

它加载的是编译后的 JavaScript。这也是 `npm test` 必须先运行编译的原因。

如果你改了 `src/adaptive/policy.ts`，却直接运行某一个 Node 测试而没有重新编译，测试可能仍在检查旧的 `out/adaptive/policy.js`。

### 2.3 生产编译与评估编译为什么分开

`tsconfig.evaluation.json` 会把评估代码编译到 `out-evaluation`。它只包含：

- `evaluation/**/*.ts`；
- `src/adaptive/core/**/*.ts`；
- 少量不依赖 VS Code 的类型、概念和策略文件。

这样，离线评估不需要启动 VS Code，也不需要真的打开 Notebook。

这体现了一个重要架构思想：

> VS Code 负责收集和展示；纯决策核心负责根据结构化输入作决定。

### 2.4 插件什么时候启动

`package.json` 中有：

```json
{
  "main": "./out/extension.js",
  "activationEvents": ["onNotebook:*"]
}
```

意思是：

1. 用户打开 Notebook；
2. VS Code 激活 CellMate；
3. VS Code 加载 `out/extension.js`；
4. 调用导出的 `activate(ctx)`；
5. `activate` 注册 Adaptive Next Step 等命令。

---

## 3. 读本项目需要的 TypeScript 基础

这一章只讲源码里真正会遇到的语法。

### 3.1 `const` 和 `let`

```ts
const store = new AdaptiveStore(context);
let generated: GeneratedExercise | undefined;
```

- `const`：变量名之后不会重新指向另一个值；
- `let`：后面允许重新赋值；
- 尽可能用 `const`，需要改变时才用 `let`。

它们近似 Python：

```python
store = AdaptiveStore(context)
generated = None
```

Python 本身不限制变量能否重新绑定，而 TypeScript 用 `const` 明确表达意图。

### 3.2 类型标注

```ts
let generated: GeneratedExercise | undefined;
```

冒号右边表示允许的类型。这里表示：

> `generated` 要么是一道 `GeneratedExercise`，要么还没有值。

TypeScript 的 `undefined` 类似 Python 的 `None`，但二者不是同一种语言对象。

### 3.3 字符串联合类型：把合法值锁死

`src/adaptive/types.ts` 定义：

```ts
export type AdaptiveAction =
  | "HINT"
  | "RETRY_WITH_SCAFFOLD"
  | "EASIER"
  | "SIMILAR"
  | "HARDER"
  | "NEXT_CONCEPT";
```

这不是普通字符串，而是说 `AdaptiveAction` 只能是这六个值之一。

因此下面是合法的：

```ts
const action: AdaptiveAction = "HINT";
```

下面会在编译时出错：

```ts
const action: AdaptiveAction = "GIVE_FULL_SOLUTION";
```

这比在 Python 中到处传任意字符串更安全。

### 3.4 `interface`：规定对象必须长什么样

```ts
export interface LearnerState {
  studentId: string;
  mastery: Record<string, number>;
}
```

意思是一个 `LearnerState` 必须有：

- 字符串 `studentId`；
- `mastery` 字典，key 是概念名，value 是数字。

一个合法值：

```ts
const learner: LearnerState = {
  studentId: "participant-a1b2c3d4",
  mastery: {
    for_loops: 66,
    accumulators: 58
  }
};
```

对应 Python 心智模型：

```python
learner = {
    "studentId": "participant-a1b2c3d4",
    "mastery": {
        "for_loops": 66,
        "accumulators": 58,
    },
}
```

区别在于 TypeScript 编译器会检查字段名称和值类型。

### 3.5 可选字段 `?`

```ts
export interface TestEvidence {
  status: "passed" | "failed" | "not_run" | "unavailable";
  summary: string;
  source?: EvidenceSource;
  confidence?: EvidenceConfidence;
  hasReliableCheck?: boolean;
}
```

`source?` 表示这个字段可能不存在。读取时必须考虑 `undefined`。

### 3.6 函数参数和返回类型

```ts
export function isValidParticipantId(
  participantId: string
): boolean {
  return /^[A-Za-z0-9_-]{3,40}$/.test(participantId);
}
```

翻译：

- 输入 `participantId`，类型是字符串；
- 返回布尔值；
- 用正则检查只能包含指定字符且长度为 3–40。

`void` 表示函数不返回供调用者使用的值：

```ts
export function registerAdaptiveNextStep(
  context: vscode.ExtensionContext
): void {
  // 注册命令
}
```

### 3.7 `async`、`Promise` 和 `await`

涉及磁盘、网络、VS Code 编辑或 Python 子进程的操作不会瞬间完成，因此使用异步函数：

```ts
async getLearner(studentId: string): Promise<LearnerState> {
  const data = await this.readData();
  return data.learners[studentId];
}
```

逐句翻译：

- `async`：这是异步函数；
- `Promise<LearnerState>`：未来会得到一个 `LearnerState`；
- `await`：暂停当前异步函数，等待读取完成，但不冻结整个 VS Code。

对应 Python：

```python
async def get_learner(student_id: str) -> LearnerState:
    data = await self.read_data()
    return data["learners"][student_id]
```

如果忘记 `await`，拿到的是 Promise，而不是最终对象。

### 3.8 类、构造函数与依赖注入

```ts
export class EvidenceExtractor {
  constructor(private readonly validator: PythonValidator) {}
}
```

这是一种简写，同时完成三件事：

1. 构造函数接收 `validator`；
2. 保存为类的私有字段；
3. `readonly` 表示字段之后不能换成另一个 validator。

创建对象：

```ts
const validator = new PythonValidator();
const evidenceExtractor = new EvidenceExtractor(validator);
```

把依赖从外部传进去叫“依赖注入”。好处是测试时可以传一个假 validator 或假 LLM，而不需要真的启动 Python 或访问网络。

### 3.9 `import` 和 `export`

```ts
import { EvidenceExtractor } from "./evidenceExtractor";
export class EvidenceExtractor { ... }
```

- `export`：允许其他文件使用这个名字；
- `import`：从另一个模块导入；
- `./`：相对于当前文件；
- TypeScript 源码通常省略 `.ts` 后缀。

`import type` 表示只需要类型，编译后不产生真实运行时导入：

```ts
import type { DecisionPolicy } from "./policies";
```

### 3.10 对象展开 `...`

```ts
return {
  ...fallbackDecision,
  policy: "llm_adaptive",
  action: selected.action
};
```

先复制 `fallbackDecision` 的所有字段，再覆盖 `policy` 和 `action`。

近似 Python：

```python
return {
    **fallback_decision,
    "policy": "llm_adaptive",
    "action": selected.action,
}
```

后出现的字段覆盖前面的同名字段。

### 3.11 可选链 `?.` 与空值回退 `??`

```ts
const source = evidence.source ?? "unknown";
const count = courseContext?.nextConcepts?.length ?? 0;
```

- `a?.b`：如果 `a` 不存在就返回 `undefined`，否则读 `b`；
- `a ?? b`：只有当 `a` 是 `null` 或 `undefined` 时才用 `b`。

不要把 `??` 与 `||` 完全等同。`0 || 50` 会得到 50，但 `0 ?? 50` 会保留合法的 0。

### 3.12 三元表达式

```ts
const delta =
  evidence.status === "passed" ? 8 :
  evidence.status === "failed" ? -6 : 0;
```

等价于：

```python
if evidence.status == "passed":
    delta = 8
elif evidence.status == "failed":
    delta = -6
else:
    delta = 0
```

### 3.13 数组的 `map`、`filter`、`find`、`sort`

```ts
const relevant = history
  .filter((attempt) => attempt.exerciseId === taskSpec.id)
  .sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
```

含义：

1. 只保留当前题目的历史；
2. 按时间从新到旧排序。

常见操作：

| TypeScript | Python 心智模型 |
|---|---|
| `array.map(f)` | `[f(x) for x in array]` |
| `array.filter(f)` | `[x for x in array if f(x)]` |
| `array.find(f)` | `next((x for x in array if f(x)), None)` |
| `array.some(f)` | `any(f(x) for x in array)` |
| `array.every(f)` | `all(f(x) for x in array)` |

### 3.14 可辨识联合类型：先看 `status` 再知道字段

`DecisionResult` 的简化形式是：

```ts
type DecisionResult =
  | { status: "needs_evidence"; action?: never }
  | { status: "action"; action: AdaptiveAction };
```

所以：

```ts
if (decision.status === "needs_evidence") {
  // 此处不能使用 decision.action
  return;
}

// 走到这里，编译器知道 action 一定存在
const action = decision.action;
```

这叫 discriminated union。`status` 是区分两种对象的标签。

### 3.15 类型守卫

```ts
function isGeneratedExercise(
  exercise: CourseExercise
): exercise is GeneratedExercise {
  return exercise.origin === "generated"
    && "testCode" in exercise;
}
```

返回类型 `exercise is GeneratedExercise` 不只是布尔值，还告诉编译器：

> 如果函数返回 true，接下来可把 `exercise` 当作 `GeneratedExercise`，读取 `testCode` 等额外字段。

### 3.16 泛型 `<T>`

```ts
async completeJson<T>(...): Promise<T>
```

`T` 是调用者指定的返回结构：

```ts
const result = await transport.completeJson<LlmFeedback>(...);
```

意思是“把解析后的 JSON 当作 `LlmFeedback`”。注意：泛型只帮助编译器，并不会自动验证外部 JSON，所以代码随后仍需 `isFeedback` 或 `normaliseSelection` 做运行时检查。

### 3.17 `Record`、`Pick` 和 `Omit`

- `Record<string, number>`：字符串到数字的字典；
- `Pick<TaskSpec, "sourceMode" | "confidence">`：只取 `TaskSpec` 的两个字段；
- `Omit<Request, "format">`：保留除了 `format` 之外的字段。

它们只在类型层工作，不会改变运行时对象。

### 3.18 `try / catch / finally`

```ts
try {
  await doWork();
} catch (error) {
  showError(error);
} finally {
  running.delete(key);
}
```

- `try`：尝试执行；
- `catch`：处理错误；
- `finally`：无论成功失败都执行。

主流程用 `finally` 删除运行锁，避免一次失败后该单元格永远显示“正在分析”。

---

## 4. 核心数据类型：系统在各层之间传什么

先读 [`src/adaptive/types.ts`](../src/adaptive/types.ts)。它像整个功能的数据字典。

### 4.1 `NotebookContext`：从界面读取的原材料

它包含：

- 当前 Notebook URI 和单元格索引；
- 当前代码和当前输出；
- VS Code 记录的执行成功状态；
- 前后 Markdown；
- 附近代码和输出。

这是“环境快照”，还不是题目判断。

### 4.2 `TaskSpec`：统一后的题目

无论是课程题、生成题还是普通 Notebook，后面都转成：

```ts
interface TaskSpec {
  id: string;
  sourceMode: SourceMode;
  taskSummary: string;
  expectedBehavior: string;
  title: string;
  promptMarkdown: string;
  targetConcepts: string[];
  primaryConcept: string;
  difficulty: number;
  confidence: number;
  // 还有可选字段
}
```

为什么需要统一类型？因为动作 selector 不应该关心题目最初来自哪个解析器。它只需要一份结构稳定的描述。

### 4.3 四个 `SourceMode`

| 模式 | 含义 |
|---|---|
| `course_verified` | 识别出的课程题 |
| `generated_attempt` | 对已经保存并验证的生成题作答 |
| `generic_llm` | 普通 Notebook 中有明确题意的题 |
| `self_study_goal` | 用户刚输入的自学目标所对应的任务规格 |

细节：创建自学题时 TaskSpec 是 `self_study_goal`。题目插入 Notebook 后带有生成题 ID；学生之后点击它时，会作为 `generated_attempt` 处理，同时保留原 learning goal 元数据。

### 4.4 `TestEvidence`：不是所有输出都叫证据

```ts
interface TestEvidence {
  status: "passed" | "failed" | "not_run" | "unavailable";
  summary: string;
  source?: EvidenceSource;
  confidence?: "high" | "medium" | "low";
  hasReliableCheck?: boolean;
}
```

`status` 与 `hasReliableCheck` 是两个维度。例如：

```ts
{
  status: "not_run",
  summary: "Run the adjacent assert check first.",
  source: "assert",
  confidence: "high",
  hasReliableCheck: false
}
```

这里系统很确定旁边有 assert，但它还没有被运行，所以不能据此更新掌握度。

### 4.5 `LearnerState`：启发式概念分数

```ts
{
  studentId: "participant-a1b2c3d4",
  mastery: {
    for_loops: 58,
    accumulators: 44
  }
}
```

未记录概念在读取时按 50。它是动作策略使用的简单状态，不是真实学习成果测量。

### 4.6 `AttemptRecord`：一次已提交尝试

它保存：

- participant；
- fingerprint；
- exercise ID；
- 动作；
- 证据；
- 可选反馈、支持、题目规格、课程推荐、生成题 ID；
- learner before/after；
- 创建时间。

历史就是 `AttemptRecord[]`。

### 4.7 `GeneratedExercise`：可执行验证过的新练习

除了普通课程题字段，它还有：

- starter code；
- reference solution；
- negative candidate；
- test code；
- 使用的模型和 prompt 版本；
- 是否验证通过；
- 是直接接受、修复、fallback 还是失败。

### 4.8 `DecisionResult`：决策核心唯一出口

结果只有两大类：

```text
needs_evidence
或
action + 六个动作之一
```

同时附带：

- reason codes；
- 使用了哪些证据摘要；
- learnerAfter；
- policy 和版本；
- LLM 理由、置信度、evidence references；
- 是否 fallback。

这使生产插件和离线评估能够共用同一种决定。

---

## 5. 一次 Adaptive Next Step 点击：逐段读主流程

生产编排文件是 [`src/adaptive/adaptiveNextStep.ts`](../src/adaptive/adaptiveNextStep.ts)。

这里的职责不是实现所有算法，而是：

> 创建各模块，按正确顺序调用它们，并在错误或证据不足时及时停止。

### 5.1 注册阶段：先创建长期使用的对象

`registerAdaptiveNextStep(context)` 开头：

```ts
const store = new AdaptiveStore(context);
const traceStore = new DecisionTraceStore(context);
const resolver = new CourseExerciseResolver(store);
const generator = new ConstrainedExerciseGenerator();
const validator = new PythonValidator();
const evidenceExtractor = new EvidenceExtractor(validator);
const genericTaskInferer = new GenericTaskInferer();
const feedbackAgent = new FeedbackAgent();
const supportAgent = new NextStepSupportAgent();
const running = new Set<string>();
```

逐个翻译：

| 变量 | 负责什么 |
|---|---|
| `store` | 保存 learner、attempt、generated exercise |
| `traceStore` | 追加 decision trace |
| `resolver` | 识别课程题或已保存生成题 |
| `generator` | 生成或 fallback 出新练习 |
| `validator` | 用 Python 运行代码和测试 |
| `evidenceExtractor` | 从普通 Notebook 找可靠检查 |
| `genericTaskInferer` | 把明确题意统一成 TaskSpec |
| `feedbackAgent` | 写短反馈 |
| `supportAgent` | 为 HINT/脚手架写具体支持 |
| `running` | 防止同一单元格并发分析两次 |

这些对象在命令注册时创建，而不是每点击一次都创建。

### 5.2 为 Python 单元格增加按钮

```ts
vscode.notebooks.registerNotebookCellStatusBarItemProvider(
  "jupyter-notebook",
  {
    provideCellStatusBarItems(cell) {
      if (
        cell.kind !== vscode.NotebookCellKind.Code ||
        cell.document.languageId !== "python"
      ) return [];

      const item = new vscode.NotebookCellStatusBarItem(
        "$(mortar-board) Adaptive Next Step",
        vscode.NotebookCellStatusBarAlignment.Right
      );
      item.command = {
        command: "CellMate.adaptiveNextStep",
        title: "Adaptive Next Step",
        arguments: [cell]
      };
      return [item];
    }
  }
);
```

这段的意思：

1. VS Code 问插件“这个单元格状态栏显示什么？”
2. 不是 Python 代码单元格就返回空数组；
3. 否则返回一个按钮；
4. 点击按钮会执行 `CellMate.adaptiveNextStep`，并把当前 cell 当参数传进去。

`return []` 是一个重要的早停：Markdown 和非 Python 单元格根本不显示该按钮。

### 5.3 注册点击命令

```ts
vscode.commands.registerCommand(
  "CellMate.adaptiveNextStep",
  async (argument?: vscode.NotebookCell) => {
    // 点击后的全部流程
  }
);
```

`argument?` 表示命令有时带 cell 参数，有时可能从命令面板调用，没有参数。`resolveCell(argument)` 会先用传入单元格，否则尝试用编辑器当前选中单元格。

### 5.4 没有可选代码单元格时

```ts
const cell = resolveCell(argument);
if (!cell) {
  const editor = vscode.window.activeNotebookEditor;
  if (!editor) {
    return vscode.window.showErrorMessage(
      "Select a Python exercise cell first."
    );
  }
  // 有空 Notebook，就可进入自学目标流程
}
```

两种情况：

- 连 Notebook 都没打开：显示错误；
- 有 Notebook 但没有合适代码 cell：可以询问学习目标并插入第一道自学题。

### 5.5 并发锁

```ts
const key =
  cell.notebook.uri.toString() + "#" + String(cell.index);
if (running.has(key)) {
  return vscode.window.showWarningMessage(
    "Adaptive Next Step is already analysing this cell."
  );
}
running.add(key);

try {
  // 主流程
} finally {
  running.delete(key);
}
```

真实源码使用模板字符串生成同样的 key；这里改写成字符串拼接，只是为了让示例更适合初学者。key 由 Notebook 地址和单元格索引组成。同一 cell 第二次点击会立即返回。`finally` 保证即使中间报错也解锁。

它只处理同一个扩展进程里的 UI 重复点击；磁盘层的并发安全另由 `AdaptiveStore` 负责。

### 5.6 participant ID

[`participant.ts`](../src/adaptive/participant.ts)：

```ts
const saved = context.globalState.get<string>(PARTICIPANT_KEY);
if (saved) return saved;

const generated =
  "participant-" + randomUUID().slice(0, 8);
await context.globalState.update(PARTICIPANT_KEY, generated);
return generated;
```

第一次使用生成匿名 ID，之后从 VS Code global state 读取。它用于区分学习状态和 trace，不应该使用真实姓名或邮箱。

`store.adoptLegacyParticipant(participantId)` 会把早期没有 participant ID 或使用 `local-demo-student` 的旧数据迁移到当前 ID。

---

## 6. 第一道安全门：系统到底知不知道题目

### 6.1 提取 Notebook 上下文

[`contextExtractor.ts`](../src/adaptive/contextExtractor.ts) 的 `extractNotebookContext(cell)` 会读取：

- 当前 cell；
- 前后最多约六个单元格范围；
- 前后 Markdown；
- 附近代码；
- 输出文本；
- VS Code 的 execution success。

它只负责“抄下来”，不负责判断题意。

### 6.2 先尝试识别课程题或生成题

```ts
const courseExercise = await resolver.tryResolve(cell);
```

[`courseExerciseResolver.ts`](../src/adaptive/courseExerciseResolver.ts) 先找：

1. 当前代码顶部是否有 `# EXERCISE_ID: ...`；
2. 如果是生成题，store 里是否存在且 `validated === true`；
3. 否则后面是否有可识别的课程检查；
4. 如果有，结合标题和 course manifest 构造 `CourseExercise`。

为什么 `tryResolve` 捕获错误并返回 `undefined`？因为“不是课程题”本身不应该让整个命令失败，系统还可以走普通 Notebook 路径。

### 6.3 非课程题必须有明确题意

```ts
const taskIntent = courseExercise
  ? undefined
  : assessNotebookTaskIntent(notebookContext);
```

[`selfStudyTemplates.ts`](../src/adaptive/selfStudyTemplates.ts) 的 `assessNotebookTaskIntent` 只接受两类明确输入：

1. 当前代码中的 marker：

   ```python
   # TASK: Write sum_values(values) using a for loop.
   ```

   同样支持 `GOAL` 和 `PROMPT`，可带 `CELLMATE_` 前缀。

2. 邻近 Markdown 中带明确任务线索，例如 Exercise、Task、Write、Implement、Return 等。

找不到时返回：

```ts
{
  status: "needs_evidence",
  reason: "missing_task_intent"
}
```

这里虽然复用了 `needs_evidence` 文字，但含义是“缺少题意依据”，还没进入正确性评估。

### 6.4 为什么此处必须立即 `return`

主流程：

```ts
if (taskIntent?.status === "needs_evidence") {
  const started = await startSelfStudyGoal(...);
  // 显示创建成功或取消
  return;
}
```

这个 `return` 保证后面不会发生：

- 不会调用 `GenericTaskInferer` 猜题；
- 不会收集与未知题目无关的证据；
- 不会读取历史后交给 selector；
- 不会更新掌握度；
- 不会保存 attempt。

这是 `fix(adaptive): require explicit task intent before assessment` 的核心，不只是一个 UI 提示。

### 6.5 普通明确题目如何变成 TaskSpec

```ts
const taskSpec = courseExercise
  ? taskSpecFromExercise(courseExercise)
  : await genericTaskInferer.infer(
      notebookContext,
      taskIntent!.statement
    );
```

`!` 是 non-null assertion：程序员告诉编译器“走到这里 taskIntent 一定存在”。这是因为前面课程题和缺题意两条路径都已处理。

[`genericTaskInferer.ts`](../src/adaptive/genericTaskInferer.ts) 的 prompt 明确规定：

> 明确题目文字是 expected behavior 的唯一权威。代码只能帮助识别概念或函数名，不能补造要求。

如果没有 LLM 配置，`normaliseTaskSpec` 仍能从明确文字和代码得到保守 TaskSpec。若推断置信度低于 0.6，主流程再次建议用户从明确学习目标开始，并提前返回。

### 6.6 自学目标流程

[`selfStudyGoal.ts`](../src/adaptive/selfStudyGoal.ts)：

1. 弹窗问是否 `Start from goal`；
2. 用户输入一个小 Python 学习目标；
3. `GoalToTaskSpecAgent` 尝试转成 TaskSpec；
4. LLM 不可用或结果不合格时使用本地模板；
5. 生成一道小题；
6. `PythonValidator.validateDetailed` 验证；
7. 保存 generated exercise；
8. 插入 Markdown、starter cell 和 visible check。

创建第一道自学题时不会建立一次“学生通过/失败”的 attempt，也不会更新 mastery，因为学生还没有作答。

---

## 7. 第二道安全门：什么才能算正确性证据

主流程调用：

```ts
const evidence = await collectEvidence({
  cell,
  parent,
  taskSpec,
  pythonPath,
  resolver,
  validator,
  evidenceExtractor,
  notebookContext
});
```

### 7.1 三条证据路径

`collectEvidence` 本身很短：

```ts
if (isGeneratedExercise(parent)) {
  // 用存储的 generated testCode 运行当前代码
}
if (taskSpec.sourceMode === "course_verified") {
  // 读取课程检查输出
}
return evidenceExtractor.collectGenericEvidence(...);
```

#### 路径 A：已验证生成题

系统将学生代码和该题保存的 `testCode` 交给 `PythonValidator.run`。来源记为 `llm_generated_tests`，明确 pass/fail 为高置信度。

#### 路径 B：课程题

`CourseExerciseResolver.collectCourseEvidence` 找到对应检查单元格，并由 [`courseCheckParser.ts`](../src/adaptive/courseCheckParser.ts) 解析：

- PyBryt：`SATISFIED: True/False`；
- assert：需要执行成功；
- pytest：需要 `N passed`；
- unittest：需要 `Ran N tests ... OK`；
- traceback、AssertionError、FAILED 等明确失败。

未知的非空输出返回 `unavailable`，不会猜成 pass。

#### 路径 C：普通 Notebook

[`evidenceExtractor.ts`](../src/adaptive/evidenceExtractor.ts) 按顺序：

1. 当前 cell 是否有真实执行失败；
2. 最近的下一个代码 cell 是否是显式 assert/pytest/unittest；
3. TaskSpec 是否带安全的生成 assert block；
4. 都没有则 `unavailable`。

只检查最近的下一个代码 cell，是为了避免把更远处、可能属于另一题的 assert 错配给当前题。

### 7.2 普通 stdout 为什么不能算通过

`evidenceFromRuntimeOutput` 对一般非空输出返回：

```ts
{
  status: "not_run",
  summary: output,
  source: "cell_output",
  confidence: "low",
  hasReliableCheck: false
}
```

因此下面不算通过：

```python
print("success")
print("passed")
```

同样，`print("Error")` 也不算真实失败。只有 VS Code 明确记录执行失败或出现真实 traceback 才作为 runtime failure。

### 7.3 安全的自动 assert block

`isSafeAssertOnlyBlock` 要求：

- 至少有一行 assert；
- 只允许注释、assert、`math` import；
- 拒绝 `open`、`exec`、`eval`、`subprocess`、`socket`、`os` 等；
- 拒绝分号等可疑组合。

这只是减少风险，不是完整沙箱。插件的生成题执行仍属于受信任的本地原型环境。

### 7.4 证据门在哪里真正生效

主流程虽然已经收集证据，但最终门控在决策核心：

```ts
const evidenceReasons =
  reasonsEvidenceIsInsufficient(input.evidence);

if (evidenceReasons.length) {
  return {
    status: "needs_evidence",
    ...
  };
}
```

触发条件：

- `status === "not_run"`；
- `status === "unavailable"`；
- `confidence === "low"`。

这三种理由分别记录为：

- `CHECK_NOT_RUN`；
- `EVIDENCE_UNAVAILABLE`；
- `LOW_CONFIDENCE_EVIDENCE`。

### 7.5 needs-evidence 分支做什么、不做什么

主流程收到 `decision.status === "needs_evidence"` 后：

1. 尝试保存一条诊断 trace；
2. 告诉学生应先运行明确检查；
3. `return`。

它不做：

- 不生成反馈动作；
- 不生成下一题；
- 不执行 `commitAttempt`；
- 不写 learner；
- 不把这次算作历史 attempt。

trace 里会标记 `modelVersion: "not-used-needs-evidence"` 和 `selectorOutcome: "not_called"`，从记录上也能证明模型没有被调用。

---

## 8. 学习者状态怎样更新

[`policy.ts`](../src/adaptive/policy.ts)：

```ts
export function updateMastery(
  state: LearnerState,
  concepts: string[],
  evidence: TestEvidence
): LearnerState {
  const normalised = normaliseLearnerState(state);

  if (
    evidence.hasReliableCheck === false ||
    evidence.status === "not_run" ||
    evidence.status === "unavailable"
  ) {
    return normalised;
  }

  const delta =
    evidence.status === "passed" ? 8 :
    evidence.status === "failed" ? -6 : 0;

  const mastery = { ...normalised.mastery };
  for (const concept of canonicalConcepts(concepts)) {
    mastery[concept] = Math.max(
      0,
      Math.min(
        100,
        masteryFor(normalised, concept) + delta
      )
    );
  }
  return { ...normalised, mastery };
}
```

逐步解释：

1. 先规范概念名，例如 `loop`、`loops`、`for_loop` 都统一为 `for_loops`；
2. 证据不可靠就原样返回；
3. pass 加 8，fail 减 6；
4. 复制 mastery，避免直接修改传入对象；
5. 每个目标概念分别更新；
6. 限制在 0–100；
7. 返回新的 LearnerState。

为什么不直接写进原对象？返回新对象更容易测试，也避免其他代码持有旧引用时被静默改变。

例子：

```text
before:
  for_loops = 50
  accumulators = 64

targetConcepts:
  [for_loops, accumulators]

reliable pass:
  for_loops = 58
  accumulators = 72
```

请不要把这个数字在论文里解释为标准化知识测量。它是一个透明、固定的原型启发式。

---

## 9. 决策核心：规则和 LLM 如何组合

建议按这个顺序读：

1. [`core/decisionEngine.ts`](../src/adaptive/core/decisionEngine.ts)
2. [`core/policies.ts`](../src/adaptive/core/policies.ts)
3. [`core/llmDecisionEngine.ts`](../src/adaptive/core/llmDecisionEngine.ts)
4. [`llmNextStepSelector.ts`](../src/adaptive/llmNextStepSelector.ts)

### 9.1 `DecisionInput` 是决策的完整输入

```ts
interface DecisionInput {
  taskSpec: TaskSpec;
  evidence: TestEvidence;
  learnerBefore: LearnerState;
  history: AttemptRecord[];
  courseContext?: CourseContext;
}
```

这里没有 VS Code cell。说明决策核心不依赖界面，可以离线评估。

### 9.2 `DecisionEngine` 统一门控和状态更新

```ts
const learnerAfter = updateMastery(...);
const evidenceReasons =
  reasonsEvidenceIsInsufficient(...);

if (evidenceReasons.length) {
  return { status: "needs_evidence", ... };
}

const selected = this.policy.select(input);
return {
  status: "action",
  action: selected.action,
  ...
};
```

无论使用 fixed、no-history 还是 full-adaptive，它们都经过相同证据门和相同 mastery updater。这样评估时比较的是“选动作的方法”，而不是各条件偷偷使用不同证据规则。

### 9.3 三个确定性策略

#### `FixedPolicy`

```ts
return input.evidence.status === "failed"
  ? { action: "RETRY_WITH_SCAFFOLD", ... }
  : { action: "SIMILAR", ... };
```

只看当前 fail/pass。

#### `NoHistoryPolicy`

它看当前证据、题目难度和课程上下文，但故意不看 learner mastery 和 history。用途是消融实验。

#### `FullAdaptivePolicy`

它会：

- 找与主要概念有关的历史；
- 计算连续成功次数；
- 计算近期概念失败；
- 调用 `decideAdaptiveAction`。

规则大意：

```text
fail:
  第一次可靠失败 → RETRY_WITH_SCAFFOLD
  同题已有 ≥2 次尝试，或概念近期已有失败 → EASIER

pass:
  同概念连续成功 ≥2 → NEXT_CONCEPT
  连续成功 ≥1 且高置信度:
    平均 mastery ≥75 → NEXT_CONCEPT
    否则 → HARDER
  无 streak:
    mastery ≥85 → NEXT_CONCEPT
    mastery ≥70 → HARDER
    否则 → SIMILAR
```

它是冻结评估基线和生产 fallback，不是当前默认 selector。

### 9.4 `LlmDecisionEngine` 的关键技巧

```ts
const fallbackDecision = this.fallback.decide(input);

if (fallbackDecision.status === "needs_evidence") {
  return {
    ...fallbackDecision,
    policy: "llm_adaptive",
    fallbackUsed: false
  };
}

const selected = await this.selector.select(input);
```

第一行先计算规则决定，有两个目的：

1. 共用确定性证据门；
2. 预先准备 LLM 无效时的 fallback。

这里“先算 fallback”不等于已经使用 fallback。只有 selector 最终没有返回合法选择时，`fallbackUsed` 才为 true。

如果证据不足，立即返回，不调用 selector。

如果 selector 返回 `undefined`：

```ts
return {
  ...fallbackDecision,
  policy: "llm_adaptive",
  reasonCodes: [
    "LLM_INVALID_FALLBACK",
    ...fallbackDecision.reasonCodes
  ],
  fallbackUsed: true,
  fallbackPolicyVersion:
    fallbackDecision.policyVersion
};
```

如果 selector 合法，则保留规则计算出的 `learnerAfter` 等公共字段，但用 LLM 的 action、reason、confidence 和 evidence references 覆盖动作部分。

---

## 10. LLM selector：它不是自由聊天

[`llmNextStepSelector.ts`](../src/adaptive/llmNextStepSelector.ts) 是动作选择最重要的模型边界。

### 10.1 模型必须返回固定 JSON

```json
{
  "action": "HINT",
  "reason": "The reliable first failure needs one local clue.",
  "evidence_reference_ids": [
    "check:current"
  ],
  "confidence": 0.82
}
```

不能返回第七种动作，也不能只写一段自然语言。

### 10.2 prompt 中的硬规则

模型会收到：

- 题目、预期行为、来源、概念、难度；
- 当前 evidence；
- learner-before mastery；
- 最近五次 attempt；
- course context；
- 当前输入专属的 evidence catalog；
- 根据 pass/fail 和 mastery 预先算出的 allowed actions。

硬限制包括：

```text
fail  → 不能 HARDER / NEXT_CONCEPT
pass  → 不能 HINT / RETRY_WITH_SCAFFOLD / EASIER
pass 且 mastery <70 → 不能 HARDER / NEXT_CONCEPT
pass 且 mastery 70–84 → 可以 HARDER，不能 NEXT_CONCEPT
NEXT_CONCEPT → 需要足够 mastery；有课程信息时还要有 course evidence
```

### 10.3 stable evidence ID 是什么

系统不会让模型自由写“我参考了历史”。它先建立目录：

```ts
[
  {
    id: "check:current",
    kind: "current_check",
    value: "..."
  },
  {
    id: "mastery:for_loops",
    kind: "mastery",
    value: "82"
  },
  {
    id: "history:abc123",
    kind: "history",
    value: "..."
  },
  {
    id: "course:exercise-3_5",
    kind: "course",
    value: "..."
  }
]
```

模型只能复制这些 ID。这样可检查它是否真的引用了存在的输入，而不是编造“学生以前失败过三次”。

### 10.4 `normaliseSelection` 为什么还要验证

TypeScript 类型不能保护来自网络的 JSON。模型可能返回任何东西，因此运行时检查：

- action 是否在六项词汇中；
- 是否与 pass/fail 冲突；
- 是否与 mastery progression 冲突；
- reason 是否为非空字符串；
- confidence 是否是有限数字；
- evidence IDs 是否 1–5 个、唯一、无换行、全部存在；
- 是否总包含 `check:current`；
- 进阶动作是否引用 mastery；
- NEXT_CONCEPT 是否在需要时引用 course。

只有全部通过才返回 `LlmNextStepSelection`。

### 10.5 一次 repair

`select` 第一次调用后：

```ts
const selected = normaliseSelection(raw, input);
if (selected) return selected;
```

无效时再请求一次，并明确告诉模型上一份结果被拒绝。第二次仍无效就返回 `undefined`，由 `LlmDecisionEngine` 使用规则 fallback。

为什么只修一次？无限重试会：

- 增加费用和延迟；
- 让结果难以复现；
- 掩盖 provider 质量；
- 可能陷入循环。

### 10.6 LLM transport

[`src/llmTransport.ts`](../src/llmTransport.ts) 抽象网络通信。

它支持：

- OpenAI-compatible chat-completions 形式；
- 另一类简单 `model + prompt + stream:false` 形式；
- JSON response mode；
- 15 秒默认 timeout；
- bearer key；
- 从不同 provider 响应结构提取文字；
- fenced JSON 或普通 JSON 提取；
- 错误分类。

错误类别包括：

- `configuration`；
- `timeout`；
- `authentication`；
- `rate_limit`；
- `network`；
- `http`；
- `invalid_response`；
- `invalid_json`；
- `unknown`。

生产插件和正式评估共用它，避免评估用一套“更容易成功”的特殊请求代码。

[`adaptive/llmClient.ts`](../src/adaptive/llmClient.ts) 是生产适配器：读取 VS Code 的 `CellMate.*` 配置，固定较低 temperature，并把异常转成 `undefined`，让上层 fallback。

---

### 10.7 当前 VS Code 配置的优先级

真正的配置键来自 `package.json`：

```json
{
  "CellMate.apiUrl": "...",
  "CellMate.apiKey": "...",
  "CellMate.modelName": "...",
  "CellMate.adaptive.apiUrl": "...",
  "CellMate.adaptive.apiKey": "...",
  "CellMate.adaptive.modelName": "...",
  "CellMate.adaptive.pythonPath": "python"
}
```

`readWorkspaceLlmConfig("adaptive")` 的含义不是“只准用 adaptive 配置”，而是：

1. adaptive URL 和 model 都可用时，优先用 adaptive；
2. 否则尝试复用通用 `CellMate.apiUrl/modelName`；
3. 两套都不完整时，返回优先项的规范化空值，上层将走本地 fallback。

因此可以只配置一套通用模型，也可以给自适应模块单独模型。

`CellMate.adaptive.coursePath` 的用途与运行时模型配置不同：当前插件运行时直接读取打包的 `resources/course_manifest.json`。课程路径的默认值描述构建来源，而实际 `build:course-manifest` 脚本当前使用命令行路径参数或自己的默认相对路径；运行时不会每次点击都扫描课程 checkout。

---

## 11. 动作选择之后：反馈、支持和下一题

不要把五个任务混成一个：

| 模块 | 问题 |
|---|---|
| GenericTaskInferer | 明确题目怎样规范化？ |
| LlmNextStepSelector | 六个动作选哪个？ |
| FeedbackAgent | 当前结果说明了什么？ |
| SupportAgent | HINT/脚手架具体给什么帮助？ |
| ExerciseGenerator | 如果要新题，题目内容是什么？ |

### 11.1 Feedback agent

[`feedbackAgent.ts`](../src/adaptive/feedbackAgent.ts) 使用 [`feedbackGuidance.ts`](../src/adaptive/feedbackGuidance.ts) 构造 prompt。

约束：

- 反馈基于证据；
- 最多约 45 个英文单词；
- pass 不能因为一次成功就声称“已经掌握”；
- fail 只解释问题和影响；
- 不提供公式、修复代码、步骤或完整答案；
- 动作支持放到下一节，不在反馈里重复。

`isFeedback` 会拒绝失败情况下带代码块、`def`、`return` 或赋值形式的完整修复。无效时使用本地 `fallbackFeedback`。

### 11.2 HINT 与 RETRY_WITH_SCAFFOLD

[`nextStepSupport.ts`](../src/adaptive/nextStepSupport.ts) 只对两个动作运行：

- HINT：一个目标明确的 clue；
- RETRY_WITH_SCAFFOLD：2–4 个步骤 + 带 `...`、`___`、`TODO` 或 `NotImplementedError` 的不完整结构。

如果 scaffold 没有占位符，或看起来是完整解答，会被拒绝。随后使用本地 fallback。

### 11.3 优先选择课程题

[`courseRecommendation.ts`](../src/adaptive/courseRecommendation.ts) 仅对 `course_verified` 生效。

- HINT/脚手架：留在当前题，不推荐新课程题；
- EASIER：找更早、共享概念、难度不高的课程题；
- 其他进阶动作：先看 manifest 的显式 `nextExercises`；
- NEXT_CONCEPT：优先找带 `nextConcepts` 的未来课程题；
- 再尝试未来的同概念题。

已经尝试过的题会被排除。

### 11.4 什么时候生成练习

`shouldGeneratePractice`：

```text
HINT / RETRY_WITH_SCAFFOLD → 不生成
generic_llm 的 EASIER/SIMILAR/HARDER/NEXT_CONCEPT → 生成
course_verified 且已有课程推荐 → 不生成
course_verified 且找不到课程推荐 → 生成
```

### 11.5 生成题验证

[`generation.ts`](../src/adaptive/generation.ts) 产生 candidate；[`pythonValidator.ts`](../src/adaptive/pythonValidator.ts) 验证。

静态检查：

- 只允许 `math` import；
- reference、starter 与 tests 的函数名要一致；
- test code 必须含 assert。

动态检查：

```text
reference solution + tests → 必须通过
starter code + tests       → 必须失败
negative candidate + tests → 若提供，必须失败
```

为什么 starter 必须失败？如果空 starter 都能通过，这道题或测试没有真正检查学习者工作。

LLM candidate 失败后：

1. 尝试 repair 一次；
2. 仍失败就用本地 verified scaffold fallback；
3. fallback 也失败则抛错，什么都不插入。

### 11.6 安全边界

`PythonValidator` 通过子进程执行代码：

```ts
spawn(
  pythonPath,
  [
    "-c",
    "import sys; ns = {}; exec(sys.stdin.read(), ns, ns)"
  ],
  { windowsHide: true }
);
```

它有 5 秒 timeout 和输出长度限制，但不是操作系统级沙箱。因此当前设计适合受信任的本地课程/原型演示，不应描述为可安全运行任意互联网代码。

---

## 12. fingerprint、原子保存和重复点击

### 12.1 fingerprint 解决什么问题

[`analysisFingerprint.ts`](../src/adaptive/analysisFingerprint.ts) 对这些内容做 SHA-256：

- participant ID；
- Notebook URI；
- cell index；
- task ID；
- 当前代码；
- evidence 状态和摘要；
- decision/feedback/support/presentation 版本；
- adaptive analysis 版本。

所以只要输入和相关算法版本不变，fingerprint 就不变。

### 12.2 为什么先查已有 attempt

主流程在完成决定后检查：

```ts
const savedAttempt =
  await store.getAttempt(attemptFingerprint);
```

如果找到：

- Notebook 中缺结果 cell：恢复保存的结果；
- 已经有结果：提示结果最新；
- 两种情况都不再次更新 learner。

为什么在决策后才查？因为 fingerprint 包含 evidence 与版本，而 needs-evidence 也需要单独 trace；真正提交前才确定这是一个可保存动作。

### 12.3 `commitAttempt` 一次保存三类数据

[`store.ts`](../src/adaptive/store.ts) 的 v3 数据：

```ts
interface StoreData {
  version: 3;
  learners: Record<string, LearnerState>;
  attempts: AttemptRecord[];
  generated: Record<string, GeneratedExercise>;
}
```

`commitAttempt` 在一次 mutation 中：

1. 查相同 fingerprint；
2. 如果已有，返回旧 attempt，`created:false`；
3. 核对 participant ID；
4. 读取当前 learner；
5. 确认它仍等于决策开始时的 `learnerBefore`；
6. 保存 learnerAfter；
7. 追加 attempt；
8. 可选保存 generated exercise；
9. 一次写回。

### 12.4 串行队列

```ts
private mutationQueue: Promise<void> =
  Promise.resolve();

private mutate<T>(
  operation: () => Promise<T>
): Promise<T> {
  const result =
    this.mutationQueue.then(operation, operation);
  this.mutationQueue =
    result.then(() => undefined, () => undefined);
  return result;
}
```

每次 mutation 都接到上一项 Promise 后面。即使上一项失败，下一项仍可继续。这防止同一进程的两次写入互相覆盖。

### 12.5 stale state 冲突

假设请求 A 和 B 都读取 learner=50：

```text
A 决策完成，提交 learner=58
B 随后提交时发现磁盘 learner 已不是 50
```

B 会抛 `AdaptiveStoreConflictError`，要求基于最新状态重跑，而不是把 A 的进度覆盖掉。

### 12.6 临时文件 + rename

`saveUnlocked`：

1. 在同目录写一个随机 `.tmp`；
2. 完整写入 JSON；
3. rename 成正式 `adaptive-next-step.json`；
4. 失败则尽量清理临时文件；
5. 保留最后一个完好的正式文件。

这就是文件级原子替换。它防止写到一半崩溃后正式文件只剩半段 JSON。

### 12.7 旧格式迁移

`migrateStore` 接受版本 1、2、3，并转换成当前 v3。未知版本或畸形数据会报错，不会用空数据覆盖。

---

## 13. Notebook 展示与 decision trace

### 13.1 展示层与决策层分开

[`studentPresentation.ts`](../src/adaptive/studentPresentation.ts) 把结构化数据变成 Markdown；[`notebookInserter.ts`](../src/adaptive/notebookInserter.ts) 负责真正编辑 Notebook。

这样测试可以在不启动 VS Code 的情况下直接检查 Markdown 字符串。

### 13.2 最终插入哪些 cell

至少插入两个 Markdown cell：

1. 当前结果：check 说明了什么；
2. 下一步：六个动作中的哪个、具体提示/脚手架/课程推荐。

若有生成练习，再插入：

3. 练习说明；
4. starter Python cell；
5. visible sanity checks Python cell。

每个结果带隐藏 HTML marker：

```html
<!-- cellmate-adaptive: source-cell=12 -->
```

用于寻找和替换同一来源 cell 的旧结果，而不是无限重复插入。

### 13.3 为什么可见测试不等于完整验证

`visibleSanityCheck` 最多显示前三个非 import 测试行，方便学生快速运行。完整 reference/negative validation 已由扩展在插入前执行。

“可见 sanity check”与“完整生成题验证”是两件事。

### 13.4 decision source

Notebook 折叠详情会显示：

- `LLM (model name)`；
- `rule-based backup`；
- 或 `rule-based policy`；
- prompt/policy version；
- LLM 理由和 confidence；
- evidence references。

这避免把 fallback 伪装成模型决定。

### 13.5 trace 与 store 的区别

| 文件 | 用途 |
|---|---|
| `adaptive-next-step.json` | 当前产品状态：learner、attempt、generated task |
| `adaptive-decision-traces.jsonl` | 追加式审计记录：每行一个 decision trace |

`JSONL` 表示 JSON Lines：每一行都是独立 JSON 对象，便于追加和逐条处理。

schema-v3 trace 包含：

- state/participant；
- TaskSpec、evidence、learnerBefore、history；
- status/action、reason codes；
- learnerAfter；
- latency；
- model/prompt/policy version；
- 是否真正用了 LLM；
- fallback；
- evidence references；
- selector outcome。

`selectorOutcome` 有四种：

- `selected`：LLM 合法选择；
- `rule_fallback`：LLM 无效，规则接管；
- `not_called`：证据门阻止调用；
- `not_applicable`：本来就是非 LLM 策略。

---

## 14. 离线评估为什么能复用生产代码

评估入口集中在：

```text
evaluation/
├─ ACTION_QUALITY_PROTOCOL_V1.md
├─ states/action-quality-v1.jsonl
├─ actionQualityRunner.ts
├─ actionQualityJudge.ts
├─ actionQualityStatistics.ts
├─ runSimulatedActionQuality.ts
└─ simulation/simulatedProviders.ts
```

### 14.1 正式评估只回答一个问题

冻结协议的问题是：

> 在构造的初学者 Python 状态上，生产受约束 LLM selector 是否比确定性基线选择了更合适的下一动作？

它不评估：

- VS Code 按钮好不好用；
- 反馈文案是否最好；
- 脚手架是否真正帮助了学生；
- 生成练习是否长期提升学习；
- 真实学生成绩是否提高。

这是理解代码边界的第一步。评估 runner 只调用 decision core，不调用 Notebook inserter、feedback agent 或 exercise generator。

### 14.2 一个 formal state 长什么样

`FormalActionQualityState` 包含：

- `state_id` 和 stratum；
- source mode；
- task；
- student code；
- 明确 evidence 与 test coverage；
- learner-before 概念分数；
- 历史支持和结果；
- 可选 course context。

它故意不包含：

- 标准答案动作；
- acceptable/forbidden actions；
- 任何策略输出；
- judge 分数；
- learner-after。

这样 runner 不会从数据中偷看到期待答案。

### 14.3 为什么有 60 个状态

固定分层：

| stratum | 数量 | 要检查什么 |
|---|---:|---|
| needs_evidence | 8 | 是否正确暂停 |
| first_failure | 10 | 首次失败是否给适度支持 |
| repeated_failure | 12 | 上次支持失败后是否升级 |
| developing_pass | 10 | 是否避免过早进阶 |
| established_pass | 10 | 是否利用强历史/掌握度进阶 |
| narrow_pass | 10 | 是否把窄测试通过误当全面掌握 |

来源是 40 个课程题、10 个生成题、10 个普通 Notebook 题。

### 14.4 `formalStateToDecisionInput` 是适配器

[`actionQualityRunner.ts`](../evaluation/actionQualityRunner.ts) 将 snake_case 的研究数据转成生产 `DecisionInput`：

```text
formal state.task
  → production TaskSpec

formal state.evidence
  → production TestEvidence

formal learner_before
  → production LearnerState

formal history
  → production AttemptRecord[]

formal course_context
  → production CourseContext
```

一旦转完，后面的引擎与产品使用同一种输入。

### 14.5 四个条件

```ts
type ActionQualityCondition =
  | "fixed-v2"
  | "full-adaptive-v1"
  | "llm-next-step-v6"
  | "no-history-v1";
```

| 条件 | 代码 |
|---|---|
| fixed-v2 | `DecisionEngine(new FixedPolicy())` |
| full-adaptive-v1 | `DecisionEngine(new FullAdaptivePolicy())` |
| llm-next-step-v6 | 生产 `LlmDecisionEngine + LlmNextStepSelector` |
| no-history-v1 | `DecisionEngine(new NoHistoryPolicy())` |

前三个是 primary comparison；no-history 是 secondary ablation。

### 14.6 60 × 4 循环

`runActionQualityStates` 的核心可简化为：

```ts
for (const state of states) {
  const input = formalStateToDecisionInput(state);

  for (const engine of engines) {
    try {
      const decision = await engine.decide(input);
      records.push(completedRecord(...));
    } catch (error) {
      records.push(errorRecord(...));
    }
  }
}
```

因此：

```text
60 states × 4 engines = 240 run records
```

每个条件拿到同一个转换后输入。某个 LLM 请求失败不会让其他三个条件消失；错误也会成为记录，而不是被静默删除。

### 14.7 可执行硬约束不依赖 judge

`findHardConstraintViolations` 直接检查结构化结果：

- status/action 是否属于固定词汇；
- 证据不足却返回 action；
- 证据充分却返回 needs-evidence；
- fail 却选择 HARDER/NEXT_CONCEPT；
- pass 却选择 remedial action；
- 无 next course concept 却选 NEXT_CONCEPT；
- LLM action 没有合法 provenance IDs。

这类错误不需要模型判断。例如 fail 后选择 NEXT_CONCEPT 是机械可检测的矛盾。

### 14.8 正式 runner 的可复现保护

CLI `main` 会：

1. 要求 `--run-id` 和数字 seed；
2. 默认拒绝 dirty Git tree；
3. 记录 source commit 和状态 hash；
4. 验证冻结协议中每个文件的 SHA-256；
5. 验证 state pack hash；
6. 从独立 selector 环境变量读取配置；
7. 生成 records 和 manifest；
8. 使用 `flag:"wx"`，拒绝覆盖同名 artifact；
9. 不记录 API key 和 provider 原始响应。

正式 selector 配置使用：

```text
CELLMATE_EVAL_SELECTOR_API_URL
CELLMATE_EVAL_SELECTOR_API_KEY
CELLMATE_EVAL_SELECTOR_MODEL
```

这与生产 VS Code settings 分开，避免无意使用错误模型。

---

## 15. blinded judge 怎么工作

[`actionQualityJudge.ts`](../evaluation/actionQualityJudge.ts) 读取已锁定的 runner records。

### 15.1 candidate 如何盲化

`buildBlindedJudgeCandidates` 为每个完成的 state-condition 记录创建候选，但给 judge 的 prompt 只包含：

- 原始状态；
- 一个候选 `status`；
- 如果是 action，再包含一个 action。

不提供：

- condition 名；
- policy/model 名；
- fallback；
- latency；
- reason codes；
- 其他条件的动作。

注意：内部 `JudgeRecord` 最终仍保存 condition，方便统计按条件汇总；“盲化”指模型请求看不到 condition，不是系统永远丢掉对应关系。

### 15.2 为什么打乱候选顺序

候选顺序由：

```text
SHA-256(seed + sourceRunId + stateId + condition)
```

确定。相同 seed 可复现相同顺序，同时避免固定按 condition 分组造成顺序偏差。

### 15.3 judge 返回什么

```json
{
  "score": 4,
  "critical_error": false,
  "confidence": 5,
  "reason": "The action is appropriate after the recorded support.",
  "evidence_reference_ids": [
    "check:status",
    "history:2"
  ]
}
```

分数：

- 5：最好或几乎最好；
- 4：明确合适，只存在小偏好差异；
- 3：允许但明显次优、重复或过早；
- 2：较大教学弱点，但不直接矛盾；
- 1：关键矛盾或不可用。

`critical_error` 必须恰好对应 score=1。

### 15.4 judge 也需要 evidence IDs 和 repair

judge 的 evidence catalog 包括：

- `task:summary`；
- `task:expected`；
- `code:current`；
- `check:status`；
- `check:summary`；
- `check:coverage`；
- learner、history、course entries。

运行时验证分数、布尔值、confidence、reason 和 IDs。第一次无效再 repair 一次；第二次无效记录 judge error，不能猜一个分数填上。

### 15.5 selector 与 judge 为什么要分开配置

judge 使用：

```text
CELLMATE_EVAL_JUDGE_API_URL
CELLMATE_EVAL_JUDGE_API_KEY
CELLMATE_EVAL_JUDGE_MODEL
```

最好与 selector 使用不同 provider 或模型家族。若相同，manifest 会标记 `selectorJudgeModelNameIdentical:true`，报告中必须披露潜在自偏好。

---

## 16. 统计代码在算什么

[`actionQualityStatistics.ts`](../evaluation/actionQualityStatistics.ts) 先验证 runner/judge artifact 的 hash 和身份关系，再汇总。

### 16.1 judge score

每个条件报告：

- 有效评分数量；
- mean；
- sample standard deviation；
- normal 95% confidence interval。

如果 judge 某些请求失败，`n` 会低于 60，所以表中同时必须看 judge coverage。

### 16.2 rate 指标

每个 rate 都保存：

- numerator；
- denominator；
- rate；
- 95% Wilson interval。

包括：

- hard-constraint violation；
- needs-evidence accuracy；
- judge critical error；
- judge completion coverage；
- invariance stability；
- LLM selector fallback。

不能只写百分比而不写分子分母。例如 0/5 和 0/60 都是 0%，可信程度不同。

### 16.3 paired difference

同一个 state 下两个条件的 judge score 可以相减：

```text
state-001: LLM score - fixed score
state-002: LLM score - fixed score
...
```

然后报告平均差与 seeded paired bootstrap 95% interval。

“paired”很重要，因为比较的是同一个学习者状态上的两个动作，不是两组互不相关样本。

### 16.4 invariance stability

意义不变、只改写文字的状态应得到相同 status/action。若一个策略因为表述变化就换动作，稳定性下降。

这不直接等于动作质量，但衡量系统是否对无关措辞过度敏感。

---

## 17. 模拟评估代码到底是什么

模拟入口：

- [`runSimulatedActionQuality.ts`](../evaluation/runSimulatedActionQuality.ts)
- [`simulation/simulatedProviders.ts`](../evaluation/simulation/simulatedProviders.ts)

### 17.1 核心思想：替换 HTTP client，不替换上层管线

生产 `LlmTransport` 依赖一个 `LlmHttpClient` 接口：

```ts
interface LlmHttpClient {
  post(
    url: string,
    body: unknown,
    config: {
      headers: Record<string, string>;
      timeout: number;
    }
  ): Promise<LlmHttpResponse>;
}
```

真实环境默认实现调用 axios。模拟环境注入：

```ts
new LlmTransport(
  new SimulatedLlmHttpClient({
    role: "selector"
  })
)
```

这就是依赖注入的价值：

```text
相同 prompt builder
相同 LlmTransport
相同 JSON 解析
相同 selector validator
相同 repair/fallback
相同 runner/judge/statistics

唯一替换：
真实 HTTP post → 内存中的假 post
```

### 17.2 为什么网络调用真的是 0

`SimulatedLlmHttpClient.post` 不访问 URL。它：

1. 解析传入的 OpenAI-compatible request；
2. 对 prompt 做 hash；
3. 决定本次故障模式；
4. 在内存中生成 JSON；
5. 包装成类似 OpenAI response 的对象返回。

audit 明确记录 `networkCalls: 0`，而 URL 使用 `simulation.invalid`。

### 17.3 故障注入

`SimulatedFaultMode`：

- `valid`：直接给合法 JSON；
- `repair_once`：第一次返回非法 evidence ID，第二次合法；
- `persistent_invalid`：两次都非法，selector 触发规则 fallback，judge 记录 error；
- `timeout`：抛一个带 `ETIMEDOUT` 的错误。

故障按 prompt ordinal 的固定倍数决定，因此相同输入、版本、seed 会得到可复现结果。

### 17.4 假 selector 做了什么

它从生产 prompt 中读出 evidence、mastery、history、course 和 allowed actions，然后用手写规则选动作。

例如：

```text
fail:
  上次没支持 → HINT
  上次 HINT → RETRY_WITH_SCAFFOLD
  上次脚手架/简单题 → EASIER

pass:
  明确写着 not covered → SIMILAR
  mastery <70 → SIMILAR
  mastery <85 → HARDER
  mastery ≥85 且有 next concept → NEXT_CONCEPT
  否则 → HARDER
```

然后生成合法 evidence IDs。

### 17.5 假 judge 为什么会给 LLM 近满分

`judgeScore` 也是手写规则。例如：

- needs-evidence 状态正确暂停得 5；
- first failure 的 HINT 得 5；
- 提示后继续失败，脚手架得 5；
- 脚手架后继续失败，EASIER 得 5；
- narrow/developing pass 更偏好 SIMILAR；
- established pass 根据 course target 偏好 HARDER 或 NEXT_CONCEPT。

假 selector 和假 judge 都由同一套设计理念写成，所以高度一致是预期行为。

因此模拟中的 4.982 只说明：

> 生产 prompt/transport/解析/验证/repair/fallback/盲化/统计管线能处理这些确定性响应。

它不说明：

> 某个真实模型在教学动作上得分 4.982。

### 17.6 为什么模拟故意保留错误

如果模拟永远只返回合法响应，就无法验证：

- timeout 是否正确分类；
- selector fallback 是否被记录；
- judge repair 是否工作；
- 第二次失败是否保留；
- coverage denominator 是否正确；
- artifact 是否仍可生成。

所以 2 个 selector timeout 和 13 个 judge error 是测试输入的一部分，不代表开发失败。

### 17.7 模拟 artifact 如何避免冒充正式结果

每个文件都带：

```json
{
  "simulated": true,
  "developmentOnly": true,
  "formalEvidence": false
}
```

另外：

- simulation ID 不允许包含 `formal`；
- 输出目录后缀是 `.simulated`；
- manifest 写明 zero network/no credentials；
- 目录 write-once；
- check mode 只比较字节，不覆盖；
- 每个 artifact 有 SHA-256。

---

## 18. 测试应该怎样读

测试不是只为“绿灯”，它们是比长文档更精确的行为例子。

### 18.1 编译后测试

`npm test` 大体执行：

```text
compile production
→ compile evaluation
→ 检查 evidence fixtures
→ 检查 state pack
→ Node unit/integration tests
```

### 18.2 最值得先读的测试

| 文件 | 你会学到什么 |
|---|---|
| [`genericTaskInference.test.js`](../test/genericTaskInference.test.js) | 裸代码为何不调用 LLM |
| [`courseEvidence.test.js`](../test/courseEvidence.test.js) | stdout、assert、pytest、PyBryt 怎样分类 |
| [`decisionEngine.test.js`](../test/decisionEngine.test.js) | 三种规则条件怎样共享证据门 |
| [`llmDecisionEngine.test.js`](../test/llmDecisionEngine.test.js) | LLM 与 fallback 如何组合 |
| [`llmNextStepSelector.test.js`](../test/llmNextStepSelector.test.js) | 动作和 evidence IDs 怎样被拒绝/repair |
| [`adaptiveStore.test.js`](../test/adaptiveStore.test.js) | 并发、迁移、原子 rename |
| [`actionQualityRunner.test.js`](../test/actionQualityRunner.test.js) | 60 states × 4 conditions 和错误保留 |
| [`simulatedActionQuality.test.js`](../test/simulatedActionQuality.test.js) | 九个 artifact、write-once、byte reproducibility |

### 18.3 一个测试逐行怎么看

例如：

```js
test(
  "keeps the deterministic evidence gate and does not call the selector",
  async () => {
    let calls = 0;

    const engine = new LlmDecisionEngine({
      async select() {
        calls += 1;
        return { ... };
      }
    });

    const result = await engine.decide(
      input({
        evidence: {
          status: "not_run",
          confidence: "high",
          hasReliableCheck: false
        }
      })
    );

    assert.equal(result.status, "needs_evidence");
    assert.equal(calls, 0);
  }
);
```

它不是只检查结果文字，还用 `calls` 证明 selector 的 `select` 根本没有被调用。

读测试时按 Arrange–Act–Assert：

1. Arrange：准备假对象和输入；
2. Act：调用被测函数；
3. Assert：检查结果与副作用。

---

## 19. 出问题时去哪个文件

| 现象 | 首先检查 |
|---|---|
| 按钮没有出现 | `package.json`、`extension.ts`、`adaptiveNextStep.ts` 注册部分 |
| 裸代码被误识别成题 | `selfStudyTemplates.ts` |
| 课程题识别不到 | `courseExerciseResolver.ts`、`courseNotebookLayout.ts`、`courseManifest.ts` |
| 普通文字被当作 pass | `evidenceExtractor.ts`、`courseCheckParser.ts` |
| needs-evidence 还调用模型 | `core/decisionEngine.ts`、`core/llmDecisionEngine.ts` |
| fail 后推荐更难题 | `llmNextStepSelector.ts` 的冲突检查 |
| LLM 返回合法 JSON 仍 fallback | `normaliseSelection` 与 evidence ID catalog |
| 提示泄露完整答案 | `nextStepSupport.ts`、`feedbackAgent.ts` |
| 生成题验证失败 | `generation.ts`、`pythonValidator.ts` |
| 同一答案重复加分 | `analysisFingerprint.ts`、`store.ts` |
| 并发写丢状态 | `store.ts::mutationQueue/commitAttempt` |
| Notebook 重复插入结果 | `notebookInserter.ts` 的 marker/range |
| trace 缺字段 | `core/decisionTrace.ts`、`traceStore.ts` |
| 正式 runner 拒绝运行 | dirty tree、freeze hash、state manifest、环境变量 |
| 模拟数字看起来异常 | `simulatedProviders.ts` 的手写 selector/judge/fault schedule |

---

## 20. 建议的源码阅读顺序

不要从 `extension.ts` 第一行读到最后一行。按以下顺序：

### 第一轮：只建立地图

1. `package.json` 中 main、activationEvents、五个 adaptive commands；
2. `src/extension.ts` 的 import 和 `activate`；
3. `src/adaptive/types.ts`；
4. `src/adaptive/adaptiveNextStep.ts`，只看每个提前 `return`。

### 第二轮：题目和证据

5. `contextExtractor.ts`；
6. `courseExerciseResolver.ts`；
7. `selfStudyTemplates.ts`；
8. `genericTaskInferer.ts`；
9. `evidenceExtractor.ts`；
10. `courseCheckParser.ts`。

### 第三轮：决策

11. `policy.ts`；
12. `core/decisionEngine.ts`；
13. `core/policies.ts`；
14. `core/llmDecisionEngine.ts`；
15. `llmNextStepSelector.ts`；
16. `llmTransport.ts`。

### 第四轮：动作落地

17. `feedbackGuidance.ts` 和 `feedbackAgent.ts`；
18. `nextStepSupport.ts`；
19. `courseRecommendation.ts`；
20. `generation.ts` 和 `pythonValidator.ts`；
21. `store.ts`；
22. `studentPresentation.ts` 和 `notebookInserter.ts`；
23. `core/decisionTrace.ts`。

### 第五轮：评估

24. `ACTION_QUALITY_PROTOCOL_V1.md`；
25. `actionQualityRunner.ts`；
26. `actionQualityJudge.ts`；
27. `actionQualityStatistics.ts`；
28. `simulatedProviders.ts`；
29. 对应测试。

每读一个文件，只回答三个问题：

1. 输入是什么？
2. 输出是什么？
3. 什么情况下提前停止或 fallback？

---

## 21. 常见误解纠正

### “LLM 负责所有自适应逻辑”

不对。任务识别有显式边界；证据门、pass/fail 硬约束、progression 限制、evidence ID 验证、repair 次数、fallback、生成题验证和存储都由确定性代码控制。

### “full-adaptive 就是最终产品”

不对。它是规则基线和 runtime fallback。生产默认动作 selector 是 `llm-next-step-v6`。

### “有输出就说明代码通过”

不对。普通 stdout 不是 assessment evidence。

### “needs-evidence 是第七种动作”

不对。它是停止状态：系统没有足够依据作教学决定。

### “模型 confidence 就是真实概率”

不对。它是模型自报的有限字段，保存用于审计，不能解释为校准概率。

### “mastery 90 表示学生掌握了 90%”

不对。当前 mastery 是固定加减的启发式状态变量。

### “本地 validator 是安全沙箱”

不对。它有静态限制和 timeout，但会启动本机 Python 执行代码。

### “模拟 LLM 得分 4.982，说明真实模型很好”

不对。模拟 selector 和 judge 都是手写函数，目的是彩排管线。

### “TypeScript interface 会自动验证 API JSON”

不对。interface 编译后消失；外部 JSON 仍要用运行时验证函数。

### “改 out 里的 JavaScript就行”

不对。下次编译会覆盖。应修改 `src/*.ts`。

---

## 22. 你可以亲手做的五个小练习

这些练习先只读和预测，不要求提交代码。

### 练习 1：预测证据

对下面 cell：

```python
print("passed")
```

预测 `TestEvidence`。答案应是 `not_run + low confidence + unreliable`，不是 passed。

### 练习 2：预测证据门

给 `LlmDecisionEngine` 一个：

```json
{
  "status": "unavailable",
  "confidence": "low",
  "hasReliableCheck": false
}
```

问 selector 调用次数。答案是 0。

### 练习 3：预测动作约束

当前 assert failed，模型返回 `HARDER`。第一次和 repair 都这样返回。最终结果应由 `full-adaptive-v1` fallback 决定，并标记 `fallbackUsed:true`。

### 练习 4：预测 mastery

`for_loops=96`，可靠 pass，结果仍是 100；`for_loops=3`，可靠 fail，结果是 0。因为代码 clamp 到 0–100。

### 练习 5：找到防重复的三层

尝试在源码中指出：

1. UI running set；
2. fingerprint 查询；
3. `commitAttempt` 内部再次检查 fingerprint。

这三层分别处理重复点击、已保存结果和并发竞争。

---

## 23. 如何安全修改一处代码

假设以后要调整动作规则，推荐流程：

```powershell
cd <repository-root>\cellmate-plugin

git status --short

# 先读对应测试和源码
# 修改 src 下的 TypeScript，不改 out

npm run compile

# 运行相关聚焦测试
node --test test/decisionEngine.test.js

# 再跑完整测试
npm test

git diff
git diff --check
```

但是当前评估协议已经冻结。若修改以下冻结文件：

- production selector；
- decision engine/trace；
- rule policies；
- LLM transport；
- protocol/state authoring schema；

旧正式 suite 就不能继续宣称是同一版本。必须更新 protocol/suite version 和 hash，再重新评估。

---

## 24. 最后用自己的话复述项目

如果你能顺畅说出下面这段，就已经真正掌握主线：

> CellMate 在学生点击 Adaptive Next Step 后，先从课程元数据、已验证生成题或明确 Notebook 文字中确定 TaskSpec。然后它只接受 PyBryt、assert、pytest/unittest、生成题 verifier 或真实运行错误作为证据。证据不足时在确定性 gate 停止，不调用 selector，也不更新学习者状态。证据充分时，系统结合 mastery、历史和课程上下文，让受约束的 LLM 从六个动作中选择一个，并验证动作与 evidence IDs；非法输出修复一次，再失败就由冻结规则 fallback。之后反馈、提示、课程推荐或生成题由独立模块完成，生成题必须本地验证。最后 learner、attempt 和可选 generated task 被原子保存，Notebook 显示结果，schema-v3 trace 保存决定来源和依据。离线评估复用相同决策核心，对 60 个构造状态运行四种条件，并由独立盲化 judge 评分；确定性模拟只验证管线，不代表真实模型质量。

最短版本仍然是：

```text
明确题目
→ 明确证据
→ 读取状态和历史
→ 选择受约束动作
→ 验证、保存、展示、审计
```

---

## 附录 A：术语中英对照

| 代码词 | 中文理解 |
|---|---|
| task intent | 明确题意 |
| TaskSpec | 统一题目规格 |
| evidence | 正确性依据 |
| evidence gate | 证据不足时的停止门 |
| learner state | 学习者概念状态 |
| mastery | 启发式概念分数 |
| attempt history | 已提交尝试历史 |
| adaptive action | 下一教学动作 |
| selector | 从六个动作选一个的组件 |
| provenance | 决定依据来自哪里 |
| evidence reference ID | 可验证的输入证据编号 |
| fallback | 主方法失败后的确定性备份 |
| scaffold | 带空白的步骤/代码结构 |
| fingerprint | 一次分析输入的稳定身份 |
| idempotent | 重复执行不会重复产生状态变化 |
| atomic commit | 要么整体写成，要么不破坏旧数据 |
| trace | 可复现、可审计的决定记录 |
| adapter | 把一种数据格式转成另一种 |
| transport | 与模型服务通信、解析和分类错误的层 |
| baseline | 用于比较的基准方法 |
| ablation | 删除某类信息后观察影响 |
| blinded judge | 不知道候选来源的评分器 |
| hard constraint | 可由程序直接判断的禁止条件 |
| invariance | 含义不变时结果也应稳定 |
| counterfactual pair | 只改变一个关键因素的成对状态 |

## 附录 B：当前关键版本

| 组件 | 版本 |
|---|---|
| 插件 | 0.4.0 |
| adaptive analysis | adaptive-analysis-v3 |
| LLM action prompt | llm-next-step-v6 |
| feedback prompt | adaptive-feedback-v3 |
| support prompt | next-step-support-v1 |
| student presentation | student-presentation-v3 |
| store | v3 |
| decision trace | schema v3 |
| fixed baseline | fixed-v2 |
| rule baseline | full-adaptive-v1 |
| no-history ablation | no-history-v1 |
| formal protocol | action-quality-protocol-v1 |
| formal suite | evaluation-policy-suite-v2 |
| judge | action-quality-judge-v1 |
| statistics | action-quality-statistics-v1 |
| simulation | action-quality-simulation-v1 |

## 附录 C：常用命令

在 `<repository-root>\cellmate-plugin` 下：

```powershell
# 编译生产插件
npm run compile

# 编译评估代码
npm run compile:eval

# 完整测试
npm test

# 旧的开发策略评估
npm run eval:policy -- --split dev

# 确定性模拟：不是正式结果
npm run eval:action-quality:simulate -- --simulation-id my-development-check --seed 20260812 --resamples 10000
```

正式 selector/judge 命令需要真实模型选择、独立配置、干净 worktree 和费用授权，因此不要把上述模拟命令误当正式模型运行。
