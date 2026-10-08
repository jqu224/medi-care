// 学习中心内容：问答套题（quizSets）与术语猜词（words）。
// 面向患者家属与患者本人，语气温和、教育性；不提供诊断或调药建议，
// 涉及病情判断引导「由医疗团队评估」，涉及用药强调「遵医嘱」。
// source 只使用已验证存在的官方页面（MedlinePlus / NIAMS），否则为 null。
import type { QuizSet, Word } from "./learningContent";

const sources = {
  ferritin: {
    name: "MedlinePlus · 铁蛋白检测",
    url: "https://medlineplus.gov/lab-tests/ferritin-blood-test/",
  },
  a1c: { name: "MedlinePlus · A1C", url: "https://medlineplus.gov/a1c.html" },
  jia: {
    name: "NIAMS · JIA 知识",
    url: "https://www.niams.nih.gov/health-topics/juvenile-arthritis",
  },
  mas: {
    name: "NIAMS · JIA 研究与资源",
    url: "https://www.niams.nih.gov/health-topics/juvenile-arthritis/more-info",
  },
  crp: {
    name: "MedlinePlus · CRP 检测",
    url: "https://medlineplus.gov/lab-tests/c-reactive-protein-crp-test/",
  },
  esr: {
    name: "MedlinePlus · 血沉（ESR）",
    url: "https://medlineplus.gov/lab-tests/erythrocyte-sedimentation-rate-esr/",
  },
  cbc: {
    name: "MedlinePlus · 全血细胞计数",
    url: "https://medlineplus.gov/lab-tests/complete-blood-count-cbc/",
  },
};

export const quizSets: QuizSet[] = [
  {
    id: "set1",
    title: "基础入门",
    description: "从最常用的概念开始，练好认识报告与照护记录的基本功。",
    questions: [
      {
        id: "q1",
        question: "HbA1c 主要反映什么？",
        options: ["某一餐后的血糖", "约过去三个月的平均血糖", "当天最高体温"],
        answer: 1,
        explanation: "HbA1c 帮助了解一段时间的平均血糖，不等于即时血糖。",
        source: sources.a1c,
      },
      {
        id: "q2",
        question: "Ferritin 的中文名称是什么？",
        options: ["血小板", "血糖", "铁蛋白"],
        answer: 2,
        explanation:
          "Ferritin 指铁蛋白，检测有助于了解铁储存，结果需要结合背景解读。",
        source: sources.ferritin,
      },
      {
        id: "q3",
        question: "计划今天服药，就等于已经服药吗？",
        options: [
          "不等于，应另记实际服药事件",
          "等于，可以自动当作已服药",
          "只要有计划就不用记录",
        ],
        answer: 0,
        explanation: "计划是安排，事件是实际发生。两者分开能减少照护沟通误差。",
        source: null,
      },
      {
        id: "q4",
        question: "应用显示“未启用风险评估”，应该怎样理解？",
        options: ["已经确认安全", "没有任何疾病", "当前只提供记录和趋势"],
        answer: 2,
        explanation: "没有启用规则不代表正常，也不能替代医生评估。",
        source: null,
      },
      {
        id: "q5",
        question: "记录血糖时，哪个信息有助于区分测量背景？",
        options: ["手机电量", "空腹、餐后或随机", "当天应用打开次数"],
        answer: 1,
        explanation: "本应用按测量背景区分血糖趋势，避免混合比较。",
        source: null,
      },
      {
        id: "s1q6",
        question: "检验结果略高于参考范围，应该怎么做？",
        options: [
          "记录下来，复诊时请医生解读",
          "立即自行加倍服药",
          "不用在意，以后不再复查",
        ],
        answer: 0,
        explanation:
          "单次轻度异常不等于病情加重。保留数值与单位，交给医生结合背景判断。",
        source: null,
      },
      {
        id: "s1q7",
        question: "学习疾病相关术语，有什么好处？",
        options: ["可以替代就诊", "方便与医疗团队沟通", "能够自行确诊"],
        answer: 1,
        explanation:
          "懂术语能更准确地描述症状和报告。诊断与治疗仍由医生负责。",
        source: null,
      },
      {
        id: "s1q8",
        question: "孩子血糖偶尔偏高一次，先怎么做？",
        options: [
          "自行增加胰岛素剂量",
          "当天不再进食",
          "记录数值与背景，必要时咨询医生",
        ],
        answer: 2,
        explanation: "单次偏高要结合饮食、运动等背景看。调整剂量必须遵医嘱。",
        source: null,
      },
    ],
  },
  {
    id: "set2",
    title: "检验指标",
    description: "认识常见检验项目的含义，学会看单位、参考范围和变化趋势。",
    questions: [
      {
        id: "s2q1",
        question: "CRP（C 反应蛋白）升高常提示什么？",
        options: ["血糖控制良好", "体内可能有炎症", "缺乏某种维生素"],
        answer: 1,
        explanation:
          "CRP 是炎症相关指标。升高不代表某一种病，原因要由医生结合症状判断。",
        source: sources.crp,
      },
      {
        id: "s2q2",
        question: "ESR 检查的中文常称是什么？",
        options: ["血沉", "血糖", "血脂"],
        answer: 0,
        explanation:
          "ESR 是红细胞沉降率，常称血沉，也是炎症相关的参考指标之一。",
        source: sources.esr,
      },
      {
        id: "s2q3",
        question: "血小板在身体里主要负责什么？",
        options: ["运输氧气", "消化食物", "帮助止血和凝血"],
        answer: 2,
        explanation:
          "血小板参与止血凝血，是全血细胞计数（血常规）中的一项。明显异常要请医生评估。",
        source: sources.cbc,
      },
      {
        id: "s2q4",
        question: "纤维蛋白原主要参与什么功能？",
        options: ["凝血", "视力", "骨骼生长"],
        answer: 0,
        explanation:
          "纤维蛋白原是凝血相关蛋白，炎症时也可能升高，需结合其他指标解读。",
        source: null,
      },
      {
        id: "s2q5",
        question: "AST 是与哪个器官相关的常见指标？",
        options: ["肝脏", "牙齿", "皮肤"],
        answer: 0,
        explanation:
          "AST 是常见的肝功能指标之一。升高的原因要由医生结合其他检查判断。",
        source: null,
      },
      {
        id: "s2q6",
        question: "LDH 升高通常说明什么？",
        options: ["一定有缺钙", "可能有细胞损伤，需进一步评估", "说明营养过剩"],
        answer: 1,
        explanation:
          "LDH 存在于多种组织，升高不指向单一疾病。医生会结合其他指标分析。",
        source: null,
      },
      {
        id: "s2q7",
        question: "甘油三酯属于哪一类检查？",
        options: ["骨密度", "听力", "血脂"],
        answer: 2,
        explanation:
          "甘油三酯是血脂指标之一。激素治疗期间，医生可能安排定期复查。",
        source: null,
      },
      {
        id: "s2q8",
        question: "前后几次检验结果不同时，怎么做更有意义？",
        options: [
          "只记住最高的一次",
          "把旧报告丢掉，只看新的",
          "记录趋势，复诊时请医生解读",
        ],
        answer: 2,
        explanation:
          "单次数值要结合单位、参考范围和变化趋势看。完整记录便于医生判断。",
        source: null,
      },
    ],
  },
  {
    id: "set3",
    title: "认识 sJIA 与 MAS",
    description: "了解全身型幼年关节炎的表现与并发症，知道何时该就医。",
    questions: [
      {
        id: "s3q1",
        question: "JIA 这个缩写指什么疾病？",
        options: ["成人风湿性关节炎", "幼年特发性关节炎", "一种血糖仪的型号"],
        answer: 1,
        explanation:
          "JIA 是 juvenile idiopathic arthritis 的缩写，即幼年特发性关节炎。",
        source: sources.jia,
      },
      {
        id: "s3q2",
        question: "sJIA 里的 s 代表什么类型？",
        options: ["皮肤型", "轻型", "全身型"],
        answer: 2,
        explanation:
          "sJIA 是全身型幼年特发性关节炎，症状可以超出关节范围。",
        source: sources.jia,
      },
      {
        id: "s3q3",
        question: "sJIA 除了关节，还可能有哪些表现？",
        options: ["发热、皮疹等全身表现", "只会影响关节", "只会影响头发指甲"],
        answer: 0,
        explanation:
          "全身型可出现发热、皮疹等关节外表现，具体症状因人而异。",
        source: sources.jia,
      },
      {
        id: "s3q4",
        question: "弛张热的体温特点是什么？",
        options: ["体温恒定，全天不变", "只有清晨短暂发热", "一天内明显升高又回落"],
        answer: 2,
        explanation:
          "弛张热指体温一天内大幅起落。记录发热时间和温度，有助于医生判断。",
        source: null,
      },
      {
        id: "s3q5",
        question: "sJIA 常见皮疹的特点是？",
        options: ["只长在脚底", "常随发热出现，热退后变淡", "一旦出现永不消退"],
        answer: 1,
        explanation:
          "sJIA 皮疹常随发热出现。拍照并记下时间，方便复诊时向医生描述。",
        source: null,
      },
      {
        id: "s3q6",
        question: "关于 MAS，哪种说法正确？",
        options: [
          "家长可以自行确诊",
          "是 sJIA 少见但严重的并发症",
          "只是普通感冒的别称",
        ],
        answer: 1,
        explanation:
          "MAS（巨噬细胞活化综合征）需要医疗团队评估。学习术语是为了更好沟通。",
        source: sources.mas,
      },
      {
        id: "s3q7",
        question: "怀疑出现 MAS 时，家庭应该怎么做？",
        options: [
          "及时联系医疗团队或就医",
          "继续观察，等症状自行消失",
          "自行加大药量",
        ],
        answer: 0,
        explanation: "MAS 进展可能很快。及时就医最关键，不要自行调药。",
        source: sources.mas,
      },
      {
        id: "s3q8",
        question: "为什么 sJIA 需要定期随访？",
        options: ["为了完成打卡任务", "随访只是形式，可有可无", "病情会变化，需医生持续跟踪"],
        answer: 2,
        explanation:
          "定期随访帮助医生评估病情与治疗反应。方案是否调整由医生决定。",
        source: null,
      },
    ],
  },
  {
    id: "set4",
    title: "用药常识",
    description: "建立安全用药观念：遵医嘱、会储存、懂沟通。",
    questions: [
      {
        id: "s4q1",
        question: "孩子症状好转后，可以自行停药吗？",
        options: ["不能，调整用药要遵医嘱", "可以，好了就不用吃了", "先停一半试试看"],
        answer: 0,
        explanation:
          "症状好转不等于可以停药。任何加减调整都应先与医生沟通。",
        source: null,
      },
      {
        id: "s4q2",
        question: "甲氨蝶呤常见的服用频率是？",
        options: ["每小时一次", "通常每周一次，按医嘱", "想起来才吃一次"],
        answer: 1,
        explanation:
          "甲氨蝶呤多为每周一次给药。具体剂量与频率以医嘱为准。",
        source: null,
      },
      {
        id: "s4q3",
        question: "使用生物制剂期间应注意什么？",
        options: ["可以随意中断疗程", "用上了就不用复查", "按医嘱用药，留意感染迹象"],
        answer: 2,
        explanation:
          "生物制剂需按医嘱规律使用。发热等感染迹象要及时告诉医生。",
        source: null,
      },
      {
        id: "s4q4",
        question: "激素（类固醇）减量的正确方式是？",
        options: ["突然全部停掉", "按医生计划逐步减量", "照搬别人的减量方案"],
        answer: 1,
        explanation: "激素需按医嘱逐渐减量，突然停用可能有风险。",
        source: null,
      },
      {
        id: "s4q5",
        question: "发现漏服了一次药，应该怎么办？",
        options: ["咨询医生或药师再处理", "下次吃双倍补上", "立刻自行补服两倍"],
        answer: 0,
        explanation: "漏服的处理因药而异。先问医生或药师，不要自行加倍。",
        source: null,
      },
      {
        id: "s4q6",
        question: "孩子接种疫苗前，应该先做什么？",
        options: ["直接接种，不必提用药", "先与主治医生沟通用药情况", "接种完再告诉医生"],
        answer: 1,
        explanation:
          "免疫相关用药会影响疫苗安排。先与医疗团队确认更稳妥。",
        source: null,
      },
      {
        id: "s4q7",
        question: "需要冷藏的药品，怎样保存才对？",
        options: ["放进冷冻室冻起来", "放在阳台晒太阳", "按说明书冷藏，外出用冰包"],
        answer: 2,
        explanation: "储存温度会影响药效。按药品说明书和药师指导保存。",
        source: null,
      },
      {
        id: "s4q8",
        question: "家庭药品储存还要注意什么？",
        options: ["保留原包装和说明书", "不同药混装在一个瓶里", "放在孩子随手可拿处"],
        answer: 0,
        explanation:
          "原包装与说明书包含批号和保存条件，便于核对与咨询。",
        source: null,
      },
    ],
  },
  {
    id: "set5",
    title: "记录与沟通",
    description: "练好记录基本功，让每一次就诊沟通更清楚。",
    questions: [
      {
        id: "s5q1",
        question: "照护计划和服药事件的区别是？",
        options: ["完全一样，可以混用", "计划是安排，事件是实际发生", "事件是对未来的打算"],
        answer: 1,
        explanation:
          "计划记录安排，事件记录实际发生。分开记能减少照护沟通误差。",
        source: null,
      },
      {
        id: "s5q2",
        question: "记录服药事件时，最该写清什么？",
        options: ["当天的天气", "手机的型号", "具体时间与剂量"],
        answer: 2,
        explanation: "时间和剂量是核对用药的关键信息，漏记容易出错。",
        source: null,
      },
      {
        id: "s5q3",
        question: "记录检验结果时，还应保留什么？",
        options: ["报告单纸张的颜色", "数值、单位和检查日期", "化验员的名字"],
        answer: 1,
        explanation: "保留单位与日期，才能正确比较不同时期的结果。",
        source: null,
      },
      {
        id: "s5q4",
        question: "孩子出皮疹时，怎样记录更有帮助？",
        options: ["只写“起了疹子”四个字", "拍照并记下出现时间", "等皮疹消退以后再说"],
        answer: 1,
        explanation: "照片和时间能帮助医生了解皮疹的形态与变化。",
        source: null,
      },
      {
        id: "s5q5",
        question: "复诊时带什么最有帮助？",
        options: ["原始报告和最近的记录", "空手去，凭记忆描述", "只带一张结论截图"],
        answer: 0,
        explanation:
          "原始报告与完整记录让医生看到全貌，沟通更高效。",
        source: null,
      },
      {
        id: "s5q6",
        question: "就诊前列一张问题清单，好处是？",
        options: ["让医生更快结束问诊", "可以因此少做检查", "避免遗漏想问的问题"],
        answer: 2,
        explanation: "把问题提前写下来，就诊时不容易遗漏，沟通更从容。",
        source: null,
      },
      {
        id: "s5q7",
        question: "本应用的照护记录保存在哪里？",
        options: ["只保存在本机", "自动上传到公共云端", "同步到其他病友手机"],
        answer: 0,
        explanation: "数据保存在本机。是否导出分享，由家庭自己决定。",
        source: null,
      },
      {
        id: "s5q8",
        question: "向医生描述病情变化时，更好的做法是？",
        options: ["只说“大概不太舒服”", "夸大症状以引起重视", "按时间顺序，结合记录讲清变化"],
        answer: 2,
        explanation:
          "按时间顺序、结合记录描述，医生更容易准确判断。",
        source: null,
      },
    ],
  },
];

export const words: Word[] = [
  {
    word: "FERRITIN",
    meaning: "铁蛋白",
    hint: "以 F 开头，报告中常见的检验术语。",
  },
  {
    word: "GLUCOSE",
    meaning: "葡萄糖",
    hint: "以 G 开头，blood glucose 指血糖。",
  },
  {
    word: "SYMPTOM",
    meaning: "症状",
    hint: "以 S 开头，用来描述身体出现的变化。",
  },
  { word: "DOSE", meaning: "剂量", hint: "四个字母，以 D 开头。" },
  { word: "THERAPY", meaning: "治疗", hint: "以 T 开头，七个字母。" },
  {
    word: "PLATELET",
    meaning: "血小板",
    hint: "以 P 开头，八个字母，帮助止血的血细胞。",
  },
  {
    word: "INSULIN",
    meaning: "胰岛素",
    hint: "以 I 开头，调节血糖的激素。",
  },
  {
    word: "VACCINE",
    meaning: "疫苗",
    hint: "以 V 开头，接种前要先和医生沟通。",
  },
  {
    word: "ANTIBODY",
    meaning: "抗体",
    hint: "以 A 开头，免疫系统制造的蛋白质。",
  },
  {
    word: "STEROID",
    meaning: "类固醇",
    hint: "以 S 开头，这类药的减量要按医生计划。",
  },
  {
    word: "CHRONIC",
    meaning: "慢性的",
    hint: "以 C 开头，形容长期、需要持续管理的状态。",
  },
  {
    word: "IMMUNE",
    meaning: "免疫的",
    hint: "以 I 开头，六个字母，与身体防御系统有关。",
  },
  {
    word: "ANEMIA",
    meaning: "贫血",
    hint: "以 A 开头，红细胞或血红蛋白不足的状态。",
  },
  {
    word: "FEVER",
    meaning: "发热",
    hint: "以 F 开头，五个字母，体温升高时的记录词。",
  },
  {
    word: "RASH",
    meaning: "皮疹",
    hint: "以 R 开头，四个字母，皮肤上能看到的变化。",
  },
  {
    word: "ARTHRITIS",
    meaning: "关节炎",
    hint: "以 A 开头，九个字母，JIA 里的那个 A。",
  },
  {
    word: "HEMOGLOBIN",
    meaning: "血红蛋白",
    hint: "以 H 开头，十个字母，红细胞里运氧的蛋白。",
  },
  {
    word: "FIBRINOGEN",
    meaning: "纤维蛋白原",
    hint: "以 F 开头，十个字母，与凝血功能有关。",
  },
  {
    word: "TRIGLYCERIDE",
    meaning: "甘油三酯",
    hint: "以 T 开头，十二个字母，血脂指标之一。",
  },
  {
    word: "DIABETES",
    meaning: "糖尿病",
    hint: "以 D 开头，需要长期管理血糖的疾病。",
  },
];
