# Final Demo Speaking Script

The English sentences below are intentionally short. The Chinese text is a
memory cue, not part of the spoken presentation.

Target length: 7–9 minutes.

## 1. Problem and contribution — about 45 seconds

**Say**

> CellMate can explain a student's current attempt. However, feedback does not
> always tell the student what to do next.
>
> My extension adds one Adaptive Next Step button. It identifies the current
> task, checks the available evidence, and uses an LLM to choose one learning
> action from a fixed list.
>
> The main contribution is the decision about the next learning step, not
> another general chatbot.

**中文记忆**

- CellMate 解释“现在哪里有问题”。
- 我的功能回答“学生下一步做什么”。
- 一个按钮，一个统一流程，不是三个独立工具。

## 2. Explain the workflow — about 75 seconds

**Say**

> First, the system identifies the current task. It may be a course exercise, a
> previously generated exercise, or a normal notebook task.
>
> If there is not enough context, the same button asks for one small learning
> goal and creates one validated self-study task.
>
> Next, the system checks whether the evidence is reliable. Reliable evidence
> may come from PyBryt, assertions, generated tests, or a clear execution
> result. If the evidence is not reliable, the system asks the student to run
> the relevant check. It does not update the learner state.
>
> With reliable evidence, the LLM receives the task, the evidence, the learner
> state, recent history, and course context. It selects one action from:
> hint, retry with scaffold, easier, similar, harder, or next concept.
>
> The response is checked before it is used. If it is invalid or contradicts
> the evidence, a rule-based backup keeps the workflow available.

**中文记忆**

- 先识别题目，再判断证据是否可靠。
- 证据不足：只要求运行检查，不更新状态。
- 证据可靠：LLM 从六个动作中选一个并解释。
- 程序检查明显矛盾；模型失败时才用备用规则。

## 3. Live demo A: course exercise — about 2 minutes

**Action**

Open the prepared course notebook. Show the learner code and its completed
course check. Click `Adaptive Next Step` on the learner code cell.

**Say**

> This is an exercise from the teacher's Introduction to Python course.
>
> I have run the learner code and the matching course check. Now I click the
> same Adaptive Next Step button on the learner cell.
>
> The system identifies the course exercise and collects the check result as
> high-confidence evidence.
>
> It then combines this evidence with the learner's current state and recent
> attempts. The LLM selects and explains the next action.
>
> Because this is course mode, the system prefers the teacher's next suitable
> exercise. It does not automatically replace the course with an unrelated
> generated question.

**Point at**

- the mode: `course_verified`;
- the evidence summary;
- the selected action and explanation;
- the recommended course exercise.

**中文记忆**

- 指出这是老师课程中的题。
- 指出可靠证据从哪里来。
- 指出 LLM 选 action。
- 最后强调 course-first：优先老师已有课程题。

## 4. Live demo B: self-study — about 2 minutes

**Action**

Open the prepared empty notebook. Click `Adaptive Next Step`, choose
`Start from goal`, and enter:

```text
I want to practise for loops and accumulators.
```

**Say**

> The same workflow also works when there is no course material.
>
> Here the notebook has no clear task. The system does not pretend that it
> understands the context. It asks whether I want to start from a small
> learning goal.
>
> I enter a goal about loops and accumulators.
>
> The system creates one mini exercise, not a complete generated course. Before
> inserting it, the reference solution and negative examples are checked
> locally.
>
> The visible checks give quick feedback to the learner. The full validation
> information remains in extension storage.
>
> After the learner completes this task, the same cell is recognised as a
> generated attempt. It then enters the normal evidence, learner-state, and
> next-step workflow.

**Point at**

- the learning goal;
- the exercise ID;
- starter code;
- the immediately following visible sanity checks;
- `Local validation: passed`.

**中文记忆**

- 没有材料时不乱猜，先问一个小目标。
- 只生成一道小题，不生成整门课。
- 插入前本地验证。
- 学生完成后变成 `generated_attempt`，回到同一个流程。

## 5. Reliability and trace — about 60 seconds

**Action**

Show one exported evaluation trace or one prepared screenshot.

**Say**

> The LLM chooses the teaching action, but it is not trusted blindly.
>
> The output must follow a fixed structure and refer to the available evidence.
> Obvious contradictions are rejected.
>
> If the LLM is unavailable or returns an invalid answer, the system records
> that a rule-based backup was used.
>
> The decision trace records the policy version, action, explanation, evidence
> references, confidence, and whether a backup was used. This makes the
> behaviour reproducible and inspectable.

**中文记忆**

- LLM 是主要选择者，但输出有固定格式和检查。
- 失败时明确记录备用方法，不能假装是 LLM。
- trace 用于复现和评估。

## 6. Evaluation — about 60 seconds

**Say**

> I do not have ethics approval for participant research, so I will not use
> students, friends, or informal human ratings as formal evidence.
>
> The evaluation therefore has two automated parts.
>
> First, I will test whether the selected action is appropriate on unseen
> learner states.
>
> Second, I will compare feedback only, a fixed next step, and the LLM adaptive
> next step in matched simulated learning trajectories.
>
> The main outcome is the unaided transfer-test pass rate. Secondary outcomes
> include next-attempt success, repeated-error resolution, attempts to success,
> and critical action errors.
>
> Correctness and transfer are measured with executable tests. An independent
> LLM reviewer is only supplementary evidence.

**中文记忆**

- 没有伦理审批，所以不把真人研究当正式证据。
- A：推荐本身是否合理。
- B：推荐后可执行表现是否改善。
- 主指标：无辅助迁移题通过率。
- 不能声称已经证明真实学生学得更好。

## 7. Close — about 20 seconds

**Say**

> In summary, I now have one working CellMate workflow: reliable evidence
> controls whether a decision can be made, the LLM selects and explains the
> next action, course material is preferred, and generated practice is locally
> validated.
>
> My next work is evaluation, not adding another notebook feature.

**中文记忆**

- 一句话收尾：证据门控、LLM 决策、课程优先、生成题验证。
- 下一步是评估，不继续堆功能。

## Short answers to likely questions

### What exactly does the LLM do?

> It selects one teaching action from a fixed list and explains that choice
> using the task, evidence, learner state, history, and course context.

### Does the LLM decide whether the code is correct?

> No. It uses the available execution evidence. If that evidence is not
> reliable, the workflow returns NEEDS_EVIDENCE instead of asking the LLM to
> guess.

### Why not always generate a new exercise?

> In course mode, the teacher's material is the primary path. Generated
> practice is used when extra support is needed or no suitable course exercise
> is available.

### What happens if the model fails?

> The response is rejected, the trace records the failure, and a rule-based
> backup keeps the workflow available.

### Have you proved that real students learn better?

> No. My current evaluation can provide controlled evidence about recommendation
> quality and subsequent executable performance in simulation. A claim about
> real learning would require an approved participant study.

