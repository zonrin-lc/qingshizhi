-- ============================================================================
-- Events.lua  历史抉择事件库
-- 基于三国史实(《三国志》诸葛亮传、李严传、魏延传等)设计的 14 个关键事件。
-- 每个选择只写"对 6 个变量的扰动",不写结局分支 —— 命运由规则引擎推演。
-- ============================================================================

require("GameState")

---@class GameEventOption
---@field label string
---@field hint? string
---@field effects? table<string, number>
---@field flags? table<string, boolean>
---@field chronicle? string

---@class GameEvent
---@field id string
---@field title string
---@field text string
---@field options GameEventOption[]
---@field requireFlag? string

local EVENTS = {
    {
        id = "ma-su",
        title = "马谡守街亭之请",
        text = "先锋空缺,马谡自请当街亭之任,言谈兵势如悬河流。丞相忆先帝白帝城遗训:「马谡言过其实,不可大用。」帐中诸将亦多以为魏延、吴懿更宜。",
        options = {
            {
                label = "违众以谡为先锋,据街亭",
                hint = "用人不疑,然赌上一战",
                effects = { morale = 8, trust = -4, provision = 0, threat = 10, health = -3 },
                flags = { maSuSent = true },
                chronicle = "五月,以马谡为先锋,进据街亭。",
            },
            {
                label = "用魏延为先锋",
                hint = "宿将稳,但违丞相素志",
                effects = { morale = 4, trust = -6, threat = 6, provision = -3 },
                flags = { usedWeiYan = true },
                chronicle = "五月,以魏延为先锋,据街亭要地。",
            },
            {
                label = "令谡留守汉中,不遣前线",
                hint = "稳妥,寒了参军的心",
                effects = { morale = -5, trust = 5, health = 3, threat = -4 },
                chronicle = "五月,留马谡于汉中参军谋事,以老将先锋。",
            },
        },
    },
    {
        id = "li-yan-grain",
        title = "李严运粮",
        text = "李严(正方)督粮汉中,接运军需。其人才干干练而心恋权位,前番曾劝进丞相「加九锡、进爵王公」。今秋粮将尽,非其手不可。",
        options = {
            {
                label = "委以全权,督粮无前",
                hint = "赌其忠,粮道系于一身",
                effects = { provision = 12, trust = -6, threat = 4 },
                flags = { liYanTrusted = true },
                chronicle = "秋,委李严全权督粮,自汉达渭。",
            },
            {
                label = "分其权,设副使监督",
                hint = "稳,但催慢粮道",
                effects = { provision = 5, trust = 4, morale = -3 },
                chronicle = "秋,置监军以分李严之权,粮运迟滞。",
            },
            {
                label = "调蒋琬接手,严留后方",
                hint = "公忠体国,但失一臂",
                effects = { provision = -4, trust = 8, morale = -4, health = 4 },
                chronicle = "秋,徙李严署郡事,召蒋琬典军粮。",
            },
        },
    },
    {
        id = "wei-yan-ziwu",
        title = "子午谷奇谋",
        text = "魏延跪帐前:「假兵五千,出子午谷直取长安,夏侯楙怯而无谋,闻臣至必弃城走。公举大军出斜谷,会于潼关。」此计险,亦此计奇。",
        options = {
            {
                label = "否其谋,正道而进",
                hint = "十全必克,无险可乘",
                effects = { threat = -5, morale = -3, provision = -4, health = -3 },
                chronicle = "亮安出陇右,以全争天下,不从子午谷之请。",
            },
            {
                label = "遣延五千兵试之",
                hint = "险中求胜,败则折将",
                effects = { threat = 15, morale = 10, trust = -8, provision = -6, health = -5 },
                flags = { ziWu = true },
                chronicle = "夏,遣魏延将五千出子午谷趋长安,大军出斜谷应之。",
            },
            {
                label = "收延为先锋,用其谋不使其险",
                hint = "取其锐气,去其险路",
                effects = { morale = 6, trust = 4, threat = 4, provision = -2 },
                flags = { usedWeiYan = true },
                chronicle = "亮纳延气而节其谋,以为前锋,出陈仓道。",
            },
        },
    },
    {
        id = "sima-women",
        title = "巾帼之辱",
        text = "司马懿坚守不出,使薛悌送巾帼妇人之服至亮军门,以激亮战。诸将怒发冲冠,三军皆请决战,曰:「丞相若不战,吾属自往!」",
        options = {
            {
                label = "忍之,受服而不战",
                hint = "分香卖履之度,非战之勇",
                effects = { morale = -8, trust = 6, health = -6, threat = -6 },
                chronicle = "亮笑受巾帼,不战。司马坚壁如故。",
            },
            {
                label = "激将出战,决战渭南",
                hint = "士气如虹,胜负一掷",
                effects = { morale = 12, threat = 18, provision = -8, health = -10 },
                flags = { forcedBattle = true },
                chronicle = "亮奋然而起,移营挑战,与司马对垒渭南。",
            },
            {
                label = "伪怒以诱敌,暗设伏兵",
                hint = "以彼之道还施彼身",
                effects = { morale = 5, threat = 8, provision = -5, health = -4, trust = -3 },
                flags = { ambushTrap = true },
                chronicle = "亮阳怒而阴设伏,遣羸兵诱魏,精锐伏于渭曲。",
            },
        },
    },
    {
        id = "tian-dan",
        title = "屯田久计",
        text = "斜谷东有废田千顷,百姓逃散,魏亦屯于对岸。参军谏曰:「若分兵屯田,为久驻之基,则粮可足而兵可逸。」然分兵则战线单薄。",
        options = {
            {
                label = "分兵五千,如敌而耕",
                hint = "缓粮道,但减战兵",
                effects = { provision = 16, morale = -6, threat = 5, health = -2, people = 6 },
                chronicle = "亮分兵屯田于斜谷,杂于渭滨百姓之间,秋收得谷万斛。",
            },
            {
                label = "全力速战,不暇耕也",
                hint = "兵贵神速,粮贵速尽",
                effects = { provision = -10, morale = 6, threat = 10, health = -4 },
                chronicle = "亮不暇屯田,悉众求战。",
            },
        },
    },
    {
        id = "spy-lidian",
        title = "都尉李惲泄密",
        text = "校尉报:军中都尉李惲暗通魏间,已泄露亮寝食之事——「诸葛公事必躬亲,食不过数升」。司马懿得报曰:「亮食少事烦,其能久乎!」",
        options = {
            {
                label = "立斩惲以杜口",
                hint = "法肃,但寒众心",
                effects = { trust = 6, morale = -6, threat = -8, health = -2 },
                chronicle = "亮斩泄密都尉李惲,军中不复言丞相起居。",
            },
            {
                label = "借间传假息,诈体健",
                hint = "以虚掩实,险着",
                effects = { threat = -10, morale = 5, trust = -4, provision = -3 },
                flags = { fakeHealth = true },
                chronicle = "亮令惲反间,伪言丞相食盛事简。司马得之,疑亮有诈。",
            },
            {
                label = "不问,坦然而处",
                hint = "君子度,敌知我虚实",
                effects = { threat = 8, trust = 3, morale = 3, health = -3 },
                chronicle = "亮不问惲罪,饮食起居,一任魏间窥之。",
            },
        },
    },
    {
        id = "chance-pojun",
        title = "孟侯请斩",
        text = "司马弟司马衍率轻骑断亮粮道之途,众不过五千,孤军深入。建威将军孟侯请曰:「此天赐也!三千骑可截杀之,断其一臂则关中空虚。」然亮正与主力相持。",
        options = {
            {
                label = "遣精骑三千,半道击之",
                hint = "战机稍纵,或伤本阵",
                effects = { provision = 8, threat = 12, morale = 8, health = -6, trust = -4 },
                flags = { simaKinSlain = true },
                chronicle = "秋,亮遣骑三千击司马衍于陈仓山道,大破之,衍仅以身免。",
            },
            {
                label = "固本阵,不贪小利",
                hint = "善战者无赫赫之功",
                effects = { threat = -6, provision = -4, morale = -3, trust = 4 },
                chronicle = "亮坚壁不进,衍粮尽自退。",
            },
        },
    },
    {
        id = "pili-yan",
        title = "严运粮失期",
        text = "霖雨连旬,栈道断绝,李严遣参军狐忠、督军成藩至亮营:「方夏水涨,漕运不通,请亮退军。」亮度上计已穷,然退则前功尽弃。",
        options = {
            {
                label = "奏后主,请以严为罪",
                hint = "法不阿贵,朝堂地震",
                effects = { trust = -12, provision = -6, morale = 5, threat = 4, health = -4 },
                flags = { liYanStripped = true },
                chronicle = "秋,亮表废李严为民,自抵成都。严既废,亮权倾一时。",
            },
            {
                label = "隐忍,以书责之令其补过",
                hint = "留其才,担其诈",
                effects = { trust = 5, provision = 9, morale = -4, threat = 6, health = -5 },
                flags = { liYanReformed = true },
                chronicle = "亮复书责严,令督诸军转运赎罪。严感惧,水次继至。",
            },
            {
                label = "顺势引军还",
                hint = "全师而退,来岁再举",
                effects = { provision = -2, morale = -8, threat = -10, trust = 3, health = 6 },
                flags = { withdrewEarly = true },
                chronicle = "亮以粮不继,伪与司马战而引军还。魏人不知,追之不及。",
            },
        },
    },
    {
        id = "qin-shao",
        title = "秦宓劝纳谏",
        text = "从事中郎秦宓自成都至,呈《雍州七郡图》:「今岁麦熟于陇上,若敛兵就食,因民望以定陇右,此高祖还定三秦故事也。然须缓攻,与百姓约法三章。」",
        options = {
            {
                label = "从宓计,转攻陇右",
                hint = "就粮于敌,然朝中疑畏",
                effects = { provision = 14, people = 8, threat = 5, trust = -8, morale = 4 },
                flags = { longyou = true },
                chronicle = "亮移军陇右,就麦于上邽,与羌胡约法,民多附之。",
            },
            {
                label = "不许,渭南不可失",
                hint = "关中乃天下腰膂",
                effects = { trust = 4, threat = 6, provision = -5, morale = -3 },
                chronicle = "亮拒宓议曰:「关中天下腰膂,舍此而他图,是避实也。」",
            },
        },
    },
    {
        id = "jian-sha-su",
        title = "街亭败后(斩谡)",
        text = "【仅马谡战败后触发】街亭既失,大军无根。亮流涕:「先帝知马谡言过其实,不用吾言,以至于此。」众议或请赦之,或请重典。",
        requireFlag = "maSuLost",
        options = {
            {
                label = "挥泪斩谡,自贬三等",
                hint = "刑上大夫,法信于三军",
                effects = { trust = 12, morale = 6, provision = 0, health = -5, threat = -5 },
                chronicle = "亮诛马谡,流涕而斩之,上表自贬三等,行丞相事。",
            },
            {
                label = "免死,削职留营效力",
                hint = "收人心,废法度",
                effects = { trust = -10, morale = -6, provision = 3, threat = 5 },
                chronicle = "亮赦马谡死,废为庶人随军,将士由是慢令。",
            },
        },
    },
    {
        id = "yicheng-han",
        title = "费祎使吴",
        text = "东吴孙权称帝,遣张弥、许晏浮海来聘。朝议或欲绝之,恐魏闻而合谋;或欲受之,联吴则魏东顾。费祎请曰:「盟以壮声威,非以分土地也。」",
        options = {
            {
                label = "遣祎聘吴,约分魏",
                hint = "东线牵制,西线得缓",
                effects = { threat = -10, trust = 5, provision = 5, morale = 4, health = -2 },
                chronicle = "冬,遣费祎使吴,权大悦,与亮盟,约东西并举。",
            },
            {
                label = "闭境自守,不假外援",
                hint = "纯正统,孤军奋斗",
                effects = { trust = 6, threat = 6, provision = -4, morale = -3 },
                chronicle = "亮曰:「吴不足恃。」绝东使,专力中原。",
            },
        },
    },
    {
        id = "jiang-wei-ji",
        title = "姜维来投(史实228,本作后移)",
        text = "天水参军姜维,少年有志,以猜忌归降。亮执其手:「凉州上士,吾得子,汉室其兴乎!」然新附之人,诸将未服。",
        options = {
            {
                label = "擢为奉义将军,当麒麟",
                hint = "得将才,失旧勋",
                effects = { morale = 6, trust = -4, threat = 8, provision = -2, health = -3 },
                flags = { jiangWei = true },
                chronicle = "亮拜姜维奉义将军,封当阳亭侯,年才三十。维自后军事多参议焉。",
            },
            {
                label = "留帐下参议,渐试其才",
                hint = "稳,但屈其志",
                effects = { morale = -2, trust = 4, threat = 4, health = 2 },
                chronicle = "亮留姜维参军议军事,未专将任。",
            },
        },
    },
    {
        id = "liu-zhoumu",
        title = "刘琰酒乱",
        text = "车骑将军刘琰,酒后失言,军中喧传「某主簿与丞相私」等语,流言无根,然动摇大将。琰乃宗室旧臣,处置轻重,关乎军体。",
        options = {
            {
                label = "召琰责问,令还成都",
                hint = "举轻若重,朝中侧目",
                effects = { trust = -8, morale = 4, threat = 3, provision = -2 },
                chronicle = "亮让责刘琰,遣归成都。宗室由是知惧。",
            },
            {
                label = "置而不问,以镇浮言",
                hint = "宰相器,然流言愈炽",
                effects = { trust = 4, morale = -5, threat = 5, provision = 2 },
                chronicle = "亮不以琰事介意,军中浮言自止。",
            },
        },
    },
    {
        id = "che-zhen-bing",
        title = "车阵之法",
        text = "前军报:魏骑日夕挑战,欲诱亮野战。长史杨仪进「车营法」:以鹿角车为阵,弩床居中,骑不得入,然进军迟缓,粮运愈艰。",
        options = {
            {
                label = "结营为车阵,以静待躁",
                hint = "克骑利器,行军如龟",
                effects = { threat = -12, provision = -6, morale = -3, health = -3, trust = 3 },
                flags = { wagonCamp = true },
                chronicle = "亮作木牛流马,更制连弩,结车营以抗魏骑,司马终不敢逼。",
            },
            {
                label = "以骑对骑,野战争锋",
                hint = "扬我所长,蹈敌所欲",
                effects = { threat = 14, morale = 10, provision = -9, health = -8 },
                chronicle = "亮列阵求战,与魏骑交锋于渭南,各有所丧。",
            },
            {
                label = "佯作车营,暗蓄机动",
                hint = "奇正相生,分心之着",
                effects = { threat = -5, provision = -3, morale = 3, health = -4, trust = -2 },
                flags = { hiddenMobility = true },
                chronicle = "亮外结车营,内伏机动,伺隙而动。",
            },
        },
    },
    {
        id = "mi-lian-bing",
        title = "糜竺兄弟馈粮?",
        text = "细作报:魏征南大将军曹真病笃(史实此年真卒),司马代其节度。新旧交替之际,魏军心未附。参军谏曰:「乘其代,大战之,此一隙也。」",
        requireFlag = "windowPhase",
        options = {
            {
                label = "全军出战,乘隙摧之",
                hint = "此战可定关中,亦可丧师",
                effects = { threat = 18, morale = 14, provision = -12, health = -12, trust = -6 },
                flags = { deciveBattle = true },
                chronicle = "亮闻曹真死,尽起六军,求司马决战于渭南。",
            },
            {
                label = "屯兵观衅,不敢悉众",
                hint = "一鼓作气再衰,慎之",
                effects = { threat = 4, provision = -3, morale = -2, trust = 4, health = -2 },
                chronicle = "亮按军不击,曰:「新故未定,间不可失,亦不可轻。」",
            },
        },
    },
}

--- 取当前回合可触发事件池:已触发过 id 的事件不再来;
--- requireFlag 事件只在标记出现后入池(且只入一次)
---@param state GameState
---@return GameEvent[] 事件数组
function EVENTS.PoolFor(state)
    ---@type GameEvent[]
    local pool = {}
    local used = state.flags.__usedEvents or {}
    for _, e in ipairs(EVENTS) do
        if not used[e.id] then
            if not e.requireFlag or state.flags[e.requireFlag] then
                table.insert(pool, e)
            end
        end
    end
    return pool
end

function EVENTS.MarkUsed(state, id)
    state.flags.__usedEvents = state.flags.__usedEvents or {}
    state.flags.__usedEvents[id] = true
end

return EVENTS
