(function (root) {
  "use strict";
  const room = {
    id: "room", title: ["房间与托管", "Room & auto-play"], paragraphs: [
      ["房主可以补机器人、转让房主或移出玩家。开局后留下空位时暂停，补齐后从原局面继续。掉线不会自动替你行动。", "The host can add bots, transfer hosting or remove players. An empty seat pauses the game; filling it resumes the same position. Disconnecting does not automatically play for you."],
      ["两分钟未操作自动托管默认关闭，仅房主可统一开启；开启后会在接管前提示。每位玩家仍可主动开启或停止自己的托管。", "Two-minute idle auto-play is off by default. Only the host can enable it for the room, with a warning before takeover. Each player can still start or stop personal auto-play."]
    ]
  };
  const localBoard = { id: "local", title: ["同设备对战", "Pass & play"], paragraphs: [
    ["开局选择「同设备」，填写两人的名字和执子；双方在同一棋盘轮流操作，不连接房间、不启用机器人。落子后轮到另一方，棋盘方向保持不变，也可以手动翻转。", "Choose Pass & play, enter both names and choose sides. Both people take turns on one board, with no room connection or bot. The view stays fixed after a move and can be flipped manually."],
    ["悔棋撤回最后一步，求和与换边再来都需在同一设备确认双方同意。认输针对当前行棋方。刷新可恢复本机进度；保存并退出会下载通用存档，之后可导入联机房间重新选座。", "Undo takes back the last move. Undo, draw and rematch ask for both players' agreement on the shared device. Resignation applies to the side to move. Refresh restores local progress; Save & leave downloads a portable file, which can later be imported into an online room with fresh seat selection."]
  ] };
  const data = {
    million: {
      "title": [
        "百万美金规则",
        "Millions of Dollars Rules"
      ],
      "sections": [
        {
          "id": "goal",
          "title": [
            "先看怎么玩、怎么算赢",
            "How to play & win"
          ],
          "paragraphs": [
            [
              "这是 2016 年版的身份谈判游戏，3-8 人，每人起始 500 万（$5M），最多 8 轮。秘密选角色，利用公开线索判断谁会撞车，再谈条件让别人退出，争取留下分赃。100 万 = $1M。",
              "This is the 2016 role-negotiation game for 3-8 players. Start with $5M each and play up to 8 rounds. Choose a secret character, use the public clues to spot duplicates, and negotiate to stay in for a share. 100 wan = $1M."
            ],
            [
              "每轮收支全部结算后，本轮参与分赃且持有至少 2000 万（$20M）的人可以获胜；多人达标时，达标者中最富有者胜。若到第 8 轮仍无人这样获胜，则比较全体玩家的总现金，最多者胜。同分共同获胜。只收谈判款、没有参与分赃，不能触发提前获胜。",
              "After all payments in a round, a player who shared that round's loot and holds at least $20M can win. If several qualify, the richest qualifier wins. If nobody wins this way by round 8, the richest player overall wins. Ties share victory. Negotiation income without sharing the loot cannot trigger an early win."
            ],
            [
              "玩法按旧版说明书核对，不混用 2024 新版。当前赃款牌的完整配置尚未核实，仍使用随机赃款；这一差异及线上处理见「本馆设置与差异」。",
              "The rules below use the 2016 rulebook, not the 2024 edition. The complete original loot-card list is not yet verified, so this implementation still generates loot randomly. See Club settings & differences for this and the online adaptations."
            ]
          ]
        },
        {
          "id": "setup",
          "title": [
            "人数与准备",
            "Players & setup"
          ],
          "paragraphs": [
            [
              "4 人使用司机、暴徒、恶棍；5-6 人加入告密者；7-8 人再加入谋士。每人每轮选一个角色，不同玩家可以选相同角色。3 人则使用全部五种角色，每人选两个不同角色，详见三人玩法。",
              "Use Driver, Brute and Crook with 4 players; add Snitch with 5-6 and Mastermind with 7-8. Each player chooses one character per round; different players may choose the same role. With 3 players, use all five roles and choose two different characters each."
            ],
            [
              "原版从 10 张赃款牌中随机取 8 张洗成牌堆，每轮用一张，用过即弃置。牌上标有赃款（800-1200 万）、每个角色的保证金（100 或 200 万），有些还有奖励角色。",
              "The original game selects 8 of its 10 loot cards at random and shuffles them into a deck. Use and discard one each round. A card specifies $8M-$12M loot, a $1M or $2M ante per character, and sometimes a bonus role."
            ],
            [
              "带头人主持讨论，不是可以替大家决定的裁判。原版由最近看过抢劫电影的人先当带头人；本馆随机指定第一位，之后每轮按座位顺时针轮换。带头人与房主是两种不同身份。",
              "The leader guides discussion, not other players' decisions. Originally, the last person to watch a heist film leads first; this club picks the first leader randomly, then passes leadership clockwise each round. Leader and room host are separate roles."
            ]
          ]
        },
        {
          "id": "flow",
          "title": [
            "每轮四步",
            "Four steps each round"
          ],
          "paragraphs": [
            [
              "① 准备：看本轮赃款、保证金和奖励，秘密选角色并缴保证金。② 谈判：公开角色线索，可以说真话或撒谎、谈价钱、付款和退出。③ 抢劫：留下的人亮身份，重复角色及被告密点名者出局。④ 分赃：存活角色分钱，结算能力和奖励，检查是否获胜。",
              "1. Plan: check loot, ante and bonus; choose secretly and pay. 2. Negotiate: use public role clues, tell the truth or bluff, bargain, pay or withdraw. 3. Heist: reveal those who stayed; duplicates and Snitch targets are eliminated. 4. Share: pay surviving characters, resolve abilities and bonuses, then check for a winner."
            ]
          ]
        },
        {
          "id": "planning",
          "title": [
            "秘密身份与公开线索",
            "Secret characters & public clues"
          ],
          "paragraphs": [
            [
              "所有人选好后，将对应的角色牌混洗，随机藏起一张，其余公开。公开牌只告诉你有哪些角色、各几张，不告诉你是谁选的。退出不会移除公开牌，所以公开区有两张司机，不代表最后一定有两名司机留下。",
              "After everyone chooses, shuffle the matching role cards, hide one at random, and reveal the rest. These show role counts, not owners. Withdrawals do not remove public cards: two public Drivers do not necessarily mean two Drivers stay for the heist."
            ],
            [
              "锁定后本轮不能改选。保证金放在自己的角色上，和赃款分开，不加入分赃。现金不够时，把现有的钱放上去，缺额由储备补足；破产仍能参加，不用借贷。",
              "Roles cannot change after locking. The ante belongs on your character and is separate from the loot. If you cannot afford it, contribute your available cash and take the shortfall from the reserve. Being broke does not prevent participation or create a loan."
            ]
          ]
        },
        {
          "id": "negotiation",
          "title": [
            "怎么谈判、怎么退出",
            "Negotiation & withdrawal"
          ],
          "paragraphs": [
            [
              "可以假报身份，也可以出钱请别人退出。谈好的退出交易必须履行：先付款，再撤回角色。本馆的退出提议由另一方接受后，同时完成付款与退出；接受前可以拒绝或撤回。直接付款只转账，不会自动让对方退出。金额按 100 万（$1M）的整数倍支付，不能超过现有现金。",
              "You may bluff about your role or pay someone to leave. An agreed withdrawal deal is binding: pay first, then withdraw the character. In this club, accepting an offer executes payment and withdrawal together; before acceptance it may be rejected or cancelled. Direct payment only transfers money, without automatic withdrawal. Pay in whole $1M, within your current cash."
            ],
            [
              "主动退出会拿回该角色的整笔保证金，谈判所得保留。退出不可反悔，本轮不再凭该角色分赃、发动能力或领取奖励。所有角色都退出的玩家必须保持沉默，不能继续谈判；身份保密到本轮结束。三人局只退出一个角色时，另一个还能继续。",
              "Voluntary withdrawal returns that character's full ante; negotiated payments are kept. Withdrawal is final. That character cannot share, use its role ability or receive a bonus this round. A player with no remaining characters stays silent and stops negotiating; their role stays secret until round end. In a three-player game, the other character may stay."
            ]
          ]
        },
        {
          "id": "refunds",
          "title": [
            "破产与保证金",
            "Being broke & ante refunds"
          ],
          "paragraphs": [
            [
              "哪些情况取回保证金？主动退出、唯一且未被点名的角色，以及所有暴徒（包括重复或被点名的暴徒）。哪些情况没收？重复或被点名的非暴徒角色。没收的钱回到储备，同一角色不会退两次。",
              "Refund the ante for voluntary withdrawal, a unique unnamed survivor, and every Brute, including duplicated or named Brutes. A non-Brute eliminated by duplication or naming forfeits its ante to the reserve. Never refund the same character twice."
            ],
            [
              "例如保证金 200 万，你只剩 100 万：自己付 100 万，储备补 100 万。若随后退出，拿回角色上的整笔 200 万；若作为非暴徒被淘汰，这 200 万全部回到储备。身无分文也一样，储备补足后照常参加。",
              "For a $2M ante with only $1M left, pay your $1M and take the missing $1M from the reserve. If you later withdraw, recover the full $2M on the character; if a non-Brute is eliminated, the full $2M returns to the reserve. With no money, the reserve supplies the full ante."
            ],
            [
              "本馆按说明书「缺额由储备补足、退出取回保证金」处理退款。现金不会扣成负数：罚款或角色间付款若不够，就付到余额为 0。下一轮仍可由储备补保证金。",
              "Refunds here follow the rulebook's shortfall funding and recovery of the ante. Online balances do not go below zero: if a penalty or role payment exceeds available cash, pay what remains. The reserve can still fund the next ante."
            ]
          ]
        },
        {
          "id": "roles",
          "title": [
            "五种角色速查",
            "Five roles at a glance"
          ],
          "items": [
            [
              "司机（绿色）：唯一留下就分赃，再向其他每个分赃角色收 100 万车费。",
              "Driver (green): share when unique, then collect $1M from each other sharing character."
            ],
            [
              "暴徒（红色）：保证金一定退。唯一且未被点名时分赃，并得一张下轮起可用的威胁卡。",
              "Brute (red): always recover the ante. If unique and unnamed, share and earn one threat for later rounds."
            ],
            [
              "恶棍（蓝色）：唯一留下就分赃，再从同样留下分赃的暴徒处拿 200 万。",
              "Crook (blue): share when unique, then take $2M from a Brute who also shares."
            ],
            [
              "告密者（紫色）：唯一时必须点名一种公开的其他角色，不能跳过。最后若只剩自己，扣 300 万且不分赃。",
              "Snitch (purple): if unique, must name another public role, with no pass. If left alone after eliminations, lose $3M and take no loot."
            ],
            [
              "谋士（金色）：唯一留下时，总赃款先加 200 万，再由存活角色一起平分。",
              "Mastermind (gold): if unique, add $2M to the total loot before the survivors divide it."
            ]
          ]
        },
        {
          "id": "role-snitch",
          "title": [
            "告密者：必须点名，独存会赔钱",
            "Snitch: mandatory naming & the lone penalty"
          ],
          "paragraphs": [
            [
              "先看还留在本轮的告密者有几名。两名或更多：全部出局、没收保证金，无人点名。恰好一名：先取回保证金，然后必须从中央公开牌中选一种其他角色，不能选择不点名，不能点告密者，也不能点只有暗牌上才有的角色。点的是角色种类，不是某位玩家。",
              "Count Snitches still in the heist. Two or more are all eliminated and forfeit their antes; none names a role. Exactly one recovers the ante and MUST choose another role from the public cards. No passing, naming Snitch, or naming a role found only on the hidden card. The target is a role type, not a player."
            ],
            [
              "被点名的在场角色全部淘汰，不能发动能力或分赃；暴徒仍退保证金，其他角色没收。如果该角色的人全在谈判中退出了，这次点名就不会淘汰任何人。若公开区根本没有其他角色可选，系统直接继续结算，这不是可以主动跳过。",
              "All active characters of the named role are eliminated without abilities or loot. Brutes still recover their antes; other roles forfeit them. If everyone of that role already withdrew, the naming eliminates nobody. If there is no other public role at all, settlement continues automatically; this is not a voluntary pass."
            ],
            [
              "扣 300 万的条件是：处理完所有重复和点名淘汰后，只剩告密者一个角色。不是只要告密者「在车上」就扣钱。独存时扣 300 万（不足则扣到 0），不分赃、不拿奖励；还有其他角色留下时，告密者正常分一份。",
              "The $3M penalty applies only if the Snitch is the sole character left AFTER duplicates and named roles are eliminated. Merely staying in the heist does not cause a penalty. A lone Snitch pays $3M (or the remaining balance), gets no loot or bonus. With another survivor, the Snitch shares normally."
            ]
          ]
        },
        {
          "id": "role-brute",
          "title": [
            "暴徒与威胁卡",
            "Brute & intimidation"
          ],
          "paragraphs": [
            [
              "暴徒不论主动退出、撞车出局或被告密点名，都拿回保证金。只有唯一且未被点名、成功留下的暴徒才拿威胁卡并参与分赃；撞车或被点名不拿威胁卡。",
              "A Brute recovers the ante whether withdrawing, duplicated or named by the Snitch. Only a unique, unnamed Brute earns a threat and shares. A duplicated or named Brute gets no threat."
            ],
            [
              "威胁卡可以累积，但刚拿到的必须等以后轮次使用。之后一张卡可在对方选定身份后、该身份公开前，私下查看对方一张角色牌，使用后消耗。三人局要选具体哪一个角色槽，不能一次看两个。查看不淘汰对手，也不让全桌看到答案。",
              "Threats accumulate, but newly earned ones can only be used in later rounds. Once an opponent has locked a character and before it is revealed, spend one threat to inspect that single card privately. In three-player games select a particular slot, not both. Inspection neither eliminates the target nor reveals the answer to the table."
            ]
          ]
        },
        {
          "id": "role-driver",
          "title": [
            "司机：按角色收车费",
            "Driver: one fare per character"
          ],
          "paragraphs": [
            [
              "唯一且未被点名的司机先正常分赃，再向每个其他分赃角色收 100 万。退出者和被淘汰者不付。三人局按角色数算，不按玩家数算；自己另一个角色给自己的司机付款，现金总额不变。",
              "A unique unnamed Driver shares, then receives $1M from every other sharing character. Withdrawn and eliminated characters pay nothing. With three players, count characters, not people; paying your own Driver changes no total cash."
            ]
          ]
        },
        {
          "id": "role-crook",
          "title": [
            "恶棍：拿走暴徒的钱",
            "Crook: take money from the Brute"
          ],
          "paragraphs": [
            [
              "恶棍和暴徒都参与分赃时，在司机车费结算后，恶棍再拿走暴徒 200 万。不是只拿暴徒这轮分到的钱，也能拿其原有现金；最多拿到其余额为 0。暴徒退出、撞车或被点名时，不发生这笔付款。",
              "If both Crook and Brute share, after Driver fares the Crook takes $2M from the Brute. This can include older cash, not just this round's share, up to the available balance. No payment occurs if Brute withdrew, duplicated or was named."
            ]
          ]
        },
        {
          "id": "role-mastermind",
          "title": [
            "谋士：给总赃款加钱",
            "Mastermind: increase the shared pot"
          ],
          "paragraphs": [
            [
              "唯一且未被点名的谋士给总赃款增加 200 万，再按留下的角色数平分。不是谋士自己额外拿 200 万。谋士撞车、退出或被点名时，不增加赃款。",
              "A unique unnamed Mastermind adds $2M to the total before dividing it among surviving characters. It is not a personal $2M bonus. No extra loot is added if Mastermind withdrew, duplicated or was named."
            ]
          ]
        },
        {
          "id": "heist",
          "title": [
            "亮牌与淘汰",
            "Reveal & eliminate"
          ],
          "paragraphs": [
            [
              "只比较尚未退出的角色。亮牌顺序是告密者、暴徒、司机、恶棍、谋士；被告密点名的角色最后亮。某个角色有两名或更多留下，该角色全部撞车出局。只有唯一且未被点名的角色继续，暴徒的退款例外见上文。线上会一次列出最终结果与账目。",
              "Only characters that stayed count. Reveal Snitch, Brute, Driver, Crook, then Mastermind; the named role reveals last. Two or more remaining characters of one role all lose by duplication. Unique unnamed characters survive, with the Brute refund exception above. Online results list the final outcomes and ledger together."
            ],
            [
              "全部出局就不分赃；只剩告密者则按独存罚款处理。退出角色本轮结束后可以公开，本馆会在结算和历史中显示。",
              "If nobody survives, nobody shares. A lone Snitch instead pays the lone penalty. Withdrawn roles need no longer remain secret after the round; this club shows them in results and history."
            ]
          ]
        },
        {
          "id": "split",
          "title": [
            "按这个顺序分钱",
            "Payout order"
          ],
          "items": [
            [
              "1. 若谋士存活，总赃款先加 200 万。",
              "1. Add $2M to the total if Mastermind survives."
            ],
            [
              "2. 按存活角色数平分，向下取整到 100 万；余款回储备，不留给下一轮。",
              "2. Divide by surviving characters, rounding down to whole $1M. Return the remainder to the reserve, not a future pot."
            ],
            [
              "3. 每个其他分赃角色向司机付 100 万。",
              "3. Every other sharing character pays the Driver $1M."
            ],
            [
              "4. 恶棍从同样分赃的暴徒处拿 200 万。",
              "4. Crook takes $2M from the sharing Brute."
            ],
            [
              "5. 如果赃款牌的奖励角色成功参与分赃，该角色再从储备拿 100 万。",
              "5. A sharing character matching the loot card's bonus role receives $1M from the reserve."
            ],
            [
              "6. 算上原有现金、保证金和谈判款，检查最终现金是否达标。",
              "6. Include older cash, ante refunds and negotiation payments when checking the final cash total."
            ]
          ]
        },
        {
          "id": "example",
          "title": [
            "分赃例子",
            "Worked payout"
          ],
          "paragraphs": [
            [
              "赃款 800 万，奖励暴徒，留下的是谋士、恶棍、暴徒。谋士使总额变为 1000 万，三人各拿 300 万，余下 100 万回储备。恶棍再拿暴徒 200 万，暴徒最后领 100 万角色奖励。此次分赃净增：谋士 300 万、恶棍 500 万、暴徒 200 万。",
              "Loot is $8M with a Brute bonus. Mastermind, Crook and Brute survive. Mastermind makes $10M total: $3M each and $1M back to the reserve. Crook takes $2M from Brute, then Brute receives its $1M bonus. Net gains from this payout: Mastermind $3M, Crook $5M, Brute $2M."
            ],
            [
              "上例只算分赃阶段，不包含此前的保证金、谈判付款。轮末的现金变化会把这些收支也算进去。",
              "The example covers only the sharing phase, excluding earlier antes and negotiation payments. The round's cash change includes those too."
            ]
          ]
        },
        {
          "id": "three-player",
          "title": [
            "官方三人玩法：每人两个角色",
            "Official three-player game: two characters each"
          ],
          "paragraphs": [
            [
              "每人从五种角色中选两个不同角色，分别交保证金，共用自己的现金与威胁卡。六张对应角色牌混洗后，藏一张、公开五张。两个角色独立处理，可以只退出一个、两个都退或都留下。",
              "Choose two different characters from all five roles and pay an ante for each, using one personal cash balance and threat supply. Shuffle the six matching role cards; hide one and reveal five. Resolve characters separately: withdraw one, both or neither."
            ],
            [
              "按留下的角色数分赃：自己两个角色都存活就拿两份。司机也按角色收费。给自己的司机付车费，或用自己的恶棍拿自己的暴徒的钱，内部抵消，不改变总现金。胜利仍按玩家总现金判断。",
              "Divide by surviving characters: if both yours survive, collect two shares. Driver fares are also per character. Paying your own Driver or stealing from your own Brute cancels internally. Victory still uses each player's total cash."
            ]
          ]
        },
        {
          "id": "variants",
          "title": [
            "官方变体：角色不能连选",
            "Official variant: Won't Get Fooled Again"
          ],
          "paragraphs": [
            [
              "默认关闭。开启后，不能连续两轮使用相同角色，包括上一轮主动退出或被淘汰的角色；隔一轮又可以选。从第二轮开始，上一轮角色公开摆出，方便大家判断这一轮的选择。",
              "Off by default. When enabled, do not use the same role in consecutive rounds, even if it withdrew or was eliminated. It becomes available again after one intervening round. From round 2, display last round's roles publicly."
            ],
            [
              "旧版推荐 4-8 人使用。本馆也允许三人局开启：上一轮两个角色都不能选，本轮从余下三种里选两个。这个三人组合用法是本馆扩展。",
              "The old edition recommends this for 4-8 players. This club also permits it with three players: exclude both previous roles and choose two of the remaining three. This three-player combination is a club extension."
            ]
          ]
        },
        {
          "id": "club",
          "title": [
            "本馆设置与差异",
            "Club settings & differences"
          ],
          "paragraphs": [
            [
              "「暴徒不分赃」是参考站的自订玩法，不是旧版官方规则。默认暴徒参与分赃。关闭后，唯一且未被点名的暴徒只退保证金、拿威胁卡，随后离场：不占份额、不付司机钱、不被恶棍拿钱，也不领赃款牌奖励。若因此只剩告密者，照样触发独存罚款。两项玩法开关都只能由房主在开局前更改。",
              "Brute does not share is a house rule from the reference website, not the 2016 rulebook. By default Brute shares. If disabled, a unique unnamed Brute only recovers the ante and earns a threat, then leaves: no share, fare, Crook payment or loot-card bonus. A Snitch left alone this way still pays its penalty. Only the host may change either variant before starting."
            ],
            [
              "赃款牌尚未完全校对：本馆目前每轮随机生成 800、900、1000、1100 或 1200 万；800 万配 100 万保证金，1200 万配 200 万，其余随机配 100 或 200 万；奖励从本局角色或无奖励中随机选。原版则是固定十张牌抽八张，不能把当前随机分布当作官方牌组。",
              "Loot cards are not fully verified: this club currently generates $8M, $9M, $10M, $11M or $12M each round. $8M uses a $1M ante, $12M uses $2M, and other amounts randomly use either ante. The bonus is a random available role or none. The original draws eight of ten fixed cards; this random distribution is not the official deck."
            ],
            [
              "线上采用随机首位带头人、公开现金、现金最低为 0，以及所有仍在场玩家确认后开始抢劫。完全退出后不能交易，但旧威胁卡仍可在身份揭晓前使用；只能私下查看，不能借此继续发言。",
              "Online play uses a random first leader, public cash, balances floored at zero, and a heist that starts when all active players confirm. Fully withdrawn players cannot trade, but may still use older threats before roles are revealed; inspection is private and does not lift the silence rule."
            ]
          ]
        },
        {
          "id": "ready",
          "title": [
            "确认开始与轮末记录",
            "Confirmation & round results"
          ],
          "paragraphs": [
            [
              "仍有角色在场的玩家每人确认一次。最后一人确认后立刻开车，所有未成交提议失效；开车前可取消确认，开车后不能再退出。告密者需要点名时，等待本人选择，不能由房主代选。掉线不算自动同意。",
              "Every player with an active character confirms once. The last confirmation starts the heist and expires pending offers. You may cancel readiness before the start, but cannot withdraw afterward. If Snitch must name a role, wait for that player's choice; hosting gives no right to choose for them. Disconnection is not consent."
            ],
            [
              "结算展示每个人的角色、结果和收支，包括保证金、谈判款、分赃、费用、奖励及罚款。没结束就由本轮带头人推进，下一轮带头人顺时针轮换；若带头人是机器人、掉线或托管，房主也可以推进。",
              "Results show each player's roles, outcomes and cash movements: antes, deals, shares, fees, bonuses and penalties. If play continues, the current leader advances and leadership rotates clockwise. The host may also advance when the leader is a bot, offline or on auto-play."
            ]
          ]
        },
        {
          "id": "room",
          "title": [
            "房间、补位与自愿托管",
            "Rooms, replacements & voluntary auto-play"
          ],
          "paragraphs": [
            [
              "转让房主须接任者同意，申请成为房主须现任房主同意。房主掉线后保留身份五分钟，期间重连取消交接；连续离线五分钟届满才按座位顺时针交给下一位在线真人，跳过机器人和离线者。主动离开立即交接；交接后再回来不会自动夺回房主。",
              "A host transfer needs the recipient's approval, and a request to become host needs the current host's approval. A disconnected host keeps the role for five minutes; returning cancels succession. Only after five continuous offline minutes does hosting pass clockwise by seat to the next online human, skipping bots and offline players. Explicitly leaving transfers it immediately; returning after succession does not reclaim hosting."
            ],
            [
              "开局后只有房主可移除其他真人或机器人，必须经过两次写明目标名字的独立确认，任一步都能取消。目标、房主或房间改变后旧确认失效。移除保留该座位、现金和游戏资产，形成空位并暂停游戏、机器人和倒计时；聊天、表情和房间管理仍可使用。",
              "After starting, only the host may remove another human or bot, with two separate confirmations naming the target and cancellation at either step. Changing the target, host or room invalidates old confirmations. Removal preserves the seat, cash and game assets as a vacancy and pauses gameplay, bots and timers; chat, reactions and room management remain available."
            ],
            [
              "新加入的真人填第一个空位，房主也可为指定空位补机器人；所有空位填齐才从原局面继续。已有成员不能再占第二个座位。移除不是封禁，被移除者可主动输入房间码重新加入，但不会自动重入；补位者不会继承旧玩家的个人托管状态。",
              "A joining human fills the first vacancy, or the host may put a bot in a specific vacancy. Resume the same game only when all vacancies are filled. Existing members cannot take a second seat. Removal is not a ban: a removed person may explicitly enter the room code to rejoin, but is not automatically reseated. Replacements do not inherit the former occupant's personal auto-play state."
            ],
            [
              "掉线或重连不会自动开启托管、退出角色或替真人行动；等待本人回来或由房主管理补位。每位玩家都可主动开始或停止自己的托管，连接正常的托管玩家仍显示在线。房主没有直接强制真人选牌、确认或点名的权限。",
              "Disconnecting or reconnecting never automatically enables auto-play, withdraws a role or acts for a human. Wait for that person or a host-managed replacement. Everyone can voluntarily start or stop personal auto-play, and connected auto-playing humans remain online. The host has no direct power to force human choices, confirmations or naming."
            ],
            [
              "全房 120 秒未操作自动托管默认关闭，只有现任房主能更改，其他人只能查看。开启后只为当前必须行动的在线真人计时，最后 20 秒提醒；有效行动或「我还在」重置时间，聊天、头像或表情不会。空位暂停倒计时；关闭此策略清除计时并停止超时托管，但保留个人主动开启的托管。策略在房主交接和补位后继续适用，不等于因掉线自动行动。",
              "Room-wide 120-second idle auto-play is off by default; only the current host can change it and everyone else sees it read-only. When enabled, only connected humans currently required to act receive deadlines, with a warning in the final 20 seconds. A valid action or Stay acknowledgement resets the timer; chat, profiles and reactions do not. Vacancies suspend deadlines. Disabling the policy clears timers and stops timeout-triggered auto-play while preserving manually enabled auto-play. The policy survives host succession and replacements; it is not automatic action on disconnect."
            ]
          ]
        }
      ],
      "sources": [
        [
          "2016 Matagot 官方说明书（英文） / Official 2016 rulebook (English)",
          "https://cdn.1j1ju.com/medias/2d/d3/e3-millions-of-dollars-rulebook.pdf"
        ],
        [
          "2016 Matagot 官方说明书（法文，保证金与变体） / French rulebook: antes & variant",
          "https://cdn.1j1ju.com/medias/c6/98/ba-millions-of-dollars-regle.pdf"
        ],
        [
          "参考站：角色颜色及暴徒不分赃变体 / Reference: role colors & Brute house rule",
          "https://million-dollar-9khy.onrender.com/"
        ]
      ]
    },
    truth: {
      "title": [
        "真心话大冒险规则",
        "Truth or Dare Rules"
      ],
      "sections": [
        {
          "id": "goal",
          "title": [
            "问答与挑战",
            "Questions & challenges"
          ],
          "paragraphs": [
            [
              "这是本馆原创的 2–8 人聚会玩法，不需要掷骰。回答真心话或完成大冒险，想玩就继续，不想玩时退出。不设总题数、不排名，也不会自动结算；玩家旁的数字只记录完成次数。",
              "This original club party game is for 2–8 players, with no dice needed. Answer truths or complete dares for as long as you like, then leave. There is no question limit, ranking or automatic finish; the number beside each player only counts completed prompts."
            ]
          ]
        },
        {
          "id": "setup",
          "title": [
            "三种玩法，同机或联机",
            "Three categories, local or online"
          ],
          "paragraphs": [
            [
              "先选 2–8 人。同机轮流：输入对应人数的名字，在同一设备操作，无需游戏服务器连接。好友联机：房主开房，朋友输入房间码；达到设定人数且全员准备后开始，各自操作自己的回合。",
              "Choose 2–8 players. Pass & play: enter that many names and use one device, without a game-server connection. Online: create a room and share its code; fill the selected seats and ready up before starting. Each person controls their own actions."
            ],
            [
              "可选真心话、大冒险或混合 Mixed。前两种整局固定题型；混合模式由当轮提问者选择真心话或大冒险。两人且只玩真心话时，还可选「共同回答」。",
              "Choose Truth only, Dare only or Mixed. The first two fix the category; in Mixed, the asker chooses Truth or Dare each round. With two players and Truth only, you can also select Answer together."
            ],
            [
              "选择轻松 Chill、心跳 Heat、爆场 Wild、失守 Unmasked、摊牌 Showdown 五档题库，每档 30 道真心话、20 道大冒险。再设置每人整局可跳过的次数：0、1、2、3、5、10 或不限。设置开局后不变。",
              "Choose Chill, Heat, Wild, Unmasked or Showdown; each level has 30 Truth and 20 Dare prompts. Set each player's skips for the entire game to 0, 1, 2, 3, 5, 10 or unlimited. Settings stay fixed once play starts."
            ]
          ]
        },
        {
          "id": "order",
          "title": [
            "随机、接力与共同回答",
            "Random, chain & together"
          ],
          "paragraphs": [
            [
              "每轮随机：系统直接抽取一位提问者，再从其他人中随机抽取回答者，两人不会相同。每轮重新抽取，可能连续抽到同一人。",
              "Random pairs: draw one asker, then randomly select a different respondent. A fresh pair is drawn each round; the same person may be selected in consecutive rounds."
            ],
            [
              "回答者接着问：首轮随机决定两人；此后上一轮回答者成为下一轮提问者，再随机抽另一人回答。跳过也会把提问权交给该回答者。两人时自然轮流互问。",
              "Respondent asks next: the first pair is random. Thereafter, the previous respondent becomes the next asker and a different respondent is drawn. This also happens after a skip. With two players, the roles alternate."
            ],
            [
              "共同回答：仅限两人真心话。直接显示同一道题，两人都回答，各自确认完成或跳过；都回应后进入下一题。同设备显示两个名字的按钮，联机时每人只能确认自己。两人轮流负责换题或自定义；任何一人回应后，本题不能再改。",
              "Answer together: for two-player Truth only. Show one shared question immediately; both answer and confirm completion or a skip separately. Advance only after both respond. One device shows both named controls; online players confirm only themselves. Players alternate who can replace or customize the question, and editing locks after either response."
            ]
          ]
        },
        {
          "id": "ask",
          "title": [
            "出题、换题与跳过",
            "Ask, replace & skip"
          ],
          "paragraphs": [
            [
              "系统先给一道题。提问者每轮最多换题两次，不消耗任何人的跳过次数；下一题重新获得两次机会。也可以输入 1–240 字自定义题目，不消耗换题次数。自定义内容应符合所选题型，留空则使用当前系统题。",
              "A prompt is drawn first. The asker has two replacements per round, without using anyone's skips; the allowance resets next question. A custom prompt of 1–240 characters does not use a replacement. Match the selected category; leave the custom box blank to use the drawn prompt."
            ],
            [
              "普通问答中，提问者点击「就问这题」发出问题，然后由回答者确认，不能替对方点击完成。共同回答不需要等待发题。题库用完后重新抽取，可能再遇到之前的题目。",
              "In paired play, the asker selects Ask this, then only the respondent confirms completion. The asker cannot confirm for them. Together mode needs no send step. Once a prompt pool is exhausted, earlier questions may appear again."
            ],
            [
              "完成后记一次；跳过不算完成，并消耗本人一次跳过机会。次数是每人整局总额，不会每题重置；刷新、重连、存档恢复或换人也不重置。用完后跳过按钮不可用，开局选「不限」则不限制。",
              "Done records one completed prompt. Skip does not count as completion and uses one personal skip. The allowance is per player for the whole game, not per question; refreshes, reconnects, saves and replacements do not reset it. At zero the Skip button is unavailable; Unlimited has no cap."
            ]
          ]
        },
        {
          "id": "consent",
          "title": [
            "热闹由大家做主",
            "Everyone sets the boundaries"
          ],
          "paragraphs": [
            [
              "游戏次数限制不代表必须接受挑战；不舒服时随时停止或退出。涉及另一位玩家时先得到同意。不要强迫别人回答隐私、接触身体、拍照或公开分享。",
              "A game allowance never obliges anyone to take a challenge: stop or leave whenever uncomfortable. Get consent before involving another person. Never pressure anyone to disclose private information, accept physical contact, be photographed or share publicly."
            ],
            [
              "游戏不要求喝酒，也没有饮酒惩罚。刺激来自即兴表演和朋友互动，不需要危险动作或让人不舒服的要求。",
              "The game requires no alcohol and has no drinking penalties. The excitement comes from improvisation and friendly interaction, without dangerous actions or uncomfortable requests."
            ]
          ]
        },
        {
          "id": "finish",
          "title": [
            "继续或退出",
            "Continue or leave"
          ],
          "paragraphs": [
            [
              "普通模式一人回应后进入下一题，共同回答需两人都回应。游戏没有固定结束点，想结束时点击退出；想下次接着玩，可以先保存存档。同设备退出会清除本机这局进度；联机退出保留席位，其他人可等你回来或由房主管理补位。",
              "One response advances paired play; together mode waits for both. Play has no fixed endpoint: leave whenever you are done, or save first to continue another time. Leaving a local game clears its progress on this device. Online, your seat remains so others can wait for you or arrange a host-managed replacement."
            ],
            [
              "机器人和托管可以自动选题、发题，回应时只跳过，不会替真人确认完成。跳过用尽时等待手动回应，机器人可由房主换成真人。若主要用机器人试玩，开局可选不限跳过。在线托管仍显示在线。",
              "Bots and auto-play can choose and send prompts; when responding they only skip, never claim a real person completed a challenge. At zero skips, wait for a manual response; the host can replace a bot with a human. Choose unlimited skips for bot demonstrations. Connected auto-playing humans stay online."
            ]
          ]
        },
        {
          "id": "room",
          "title": [
            "联机房间与中途补位",
            "Online rooms & replacements"
          ],
          "paragraphs": [
            [
              "房主管理沿用本馆共享规则：转让或申请房主需对方同意。房主掉线保留身份五分钟，期间回来仍是房主；持续离线到期后按座位顺序交给下一位在线真人，主动离开则立即交接。",
              "Shared room controls apply: a host transfer or request requires the other person's approval. A disconnected host keeps hosting for five minutes; returning in time cancels succession. On expiry, the next online human in seat order takes over. Explicitly leaving transfers hosting immediately."
            ],
            [
              "开局后房主可通过两次具名确认移除其他真人或机器人，空位保留原座位与完成次数并暂停行动。新加入的真人填第一个空位，或由房主给指定空位补机器人，全部补齐后继续。移除不是封禁，被移除者可主动输入房间码再次加入；刷新不自动重新入座。",
              "After starting, the host may remove another human or bot through two confirmations naming the target. The vacant seat keeps its position and completion count, and play pauses. A new human fills the first vacancy, or the host assigns a bot to a chosen vacancy; play resumes once all vacancies are filled. Removal is not a ban: the person may enter the code to join again, but is not automatically reseated on refresh."
            ],
            [
              "两分钟未操作自动托管默认关闭，仅房主可为全房开启。开启后只对当前需行动的在线真人计时，最后 20 秒提醒；有效行动或「我还在」会重置时间。聊天、头像和表情不重置计时，空位时暂停。关闭房间托管会停止超时接管，但保留个人主动开启的托管。",
              "Room-wide two-minute idle auto-play is off by default and only the host may enable it. When enabled, only the required connected human actor is timed, with a warning in the final 20 seconds. A valid action or Stay acknowledgement resets the timer; chat, profiles and reactions do not. Vacancies suspend timers. Disabling the room policy stops timeout auto-play while preserving manually enabled auto-play."
            ],
            [
              "每位玩家都可以主动开启或停止自己的托管。掉线不会自动替你跳过，房间等待你回来或由房主管理补位。房间保存在服务器内存中，服务器重启后需要重新开房。",
              "Each player may start or stop personal auto-play. Disconnecting never automatically skips your turn: the room waits for your return or a host-managed replacement. Rooms live in server memory, so a server restart requires a new room."
            ]
          ]
        }
      ],
      "sources": []
    },
    poker: {
      title: ["德州扑克规则", "Texas Hold'em Rules"], sections: [
        { id: "goal", title: ["如何获胜", "The goal"], paragraphs: [
          ["2–8 人，使用不含大小王的 52 张牌。每人两张底牌，桌面最多发五张公共牌。从这七张里任选最强的五张比大小，可以使用两张、一张或完全不用自己的底牌。", "2–8 players use a 52-card deck without jokers. Combine your two hole cards with up to five community cards to make the best five-card hand. You may use both, one or neither hole card."],
          ["让其他人都弃牌，或在摊牌时赢过仍在争夺同一底池的人，就能拿到相应筹码。筹码用完的玩家不再参加下一手；最后还有筹码的人赢得本场。", "Win a pot by making everyone else fold, or by holding the best hand among its eligible players at showdown. Players with no chips sit out later hands; the last player with chips wins the match."]
        ] },
        { id: "flow", title: ["发牌与行动顺序", "Deal & turn order"], paragraphs: [
          ["庄家标记 D 每手顺移。多人局中，庄家左侧依次下小盲、大盲；翻牌前从大盲左侧开始行动。只剩两人时，庄家下小盲并先行动。", "The dealer button D moves each hand. With three or more players, the next two seats post small and big blinds; pre-flop action starts after the big blind. Heads-up, the dealer posts the small blind and acts first."],
          ["四轮下注依次为：底牌发完后；翻牌 Flop（三张公共牌）；转牌 Turn（第四张）；河牌 River（第五张）。翻牌以后，从庄家左侧第一位仍可行动的人开始。跟齐下注且都行动过，才进入下一轮。", "The four betting rounds are pre-flop, flop (three board cards), turn (the fourth) and river (the fifth). After the flop, the first eligible player after the dealer acts first. A round ends when all acting players have matched the bet and taken their turns."],
          ["未弃牌的人都全下、无法继续下注时，剩余公共牌直接发完并摊牌。本桌可设固定盲注或按手数升盲，当前大小盲以牌桌显示为准。", "If no further betting is possible because players are all-in, the remaining board runs out for showdown. This table supports fixed blinds or increases by hand count; the current blinds are shown at the table."]
        ] },
        { id: "actions", title: ["下注、跟注与全下", "Betting & all-in"], paragraphs: [
          ["过牌 Check：本轮不欠注时，把行动交给下一人。跟注 Call：补齐当前下注差额。弃牌 Fold：放弃这一手及已投入的筹码。下注 Bet／加注 Raise：把本轮总下注提高到指定金额。", "Check when you owe no chips. Call to match the outstanding bet. Fold to give up the hand and chips already committed. Bet or raise to increase your total contribution for this betting round."],
          ["无上限下注，最多可投入自己的全部筹码。首次下注至少一个大盲；之后的完整加注，增量至少等于上一次完整加注的增量。加注框中的金额是「本轮总共下到多少」，不是额外增加多少。", "No-limit betting allows your entire stack. An opening bet must reach the big blind; a full raise must increase the bet by at least the previous full raise increment. The raise amount is your total for this round, not an additional amount."],
          ["筹码不够跟齐时，可以把剩余筹码全部投入，仍有资格争夺自己投入的部分。本馆简化处理：不足完整加注的全下也会重新开放其他玩家的加注机会。", "You may call all-in for less and remain eligible for the amount you covered. Club variation: a short all-in raise also reopens raising for the other players."]
        ] },
        { id: "rankings", title: ["牌型大小", "Hand rankings"], paragraphs: [
          ["从大到小排列；先比较牌型，再比较组成牌型的点数，最后依次比较踢脚牌。花色没有大小之分。", "Listed strongest first. Compare the category, then its main ranks, then kickers in descending order. Suits never break a tie."]
        ], items: [
          ["皇家同花顺：同花色 A K Q J 10。", "Royal flush: A K Q J 10 of one suit."],
          ["同花顺：同花色的五张连续牌，比最高张。", "Straight flush: five consecutive cards in one suit; compare the top card."],
          ["四条：四张同点数，先比四条，再比单张。", "Four of a kind: compare the four equal ranks, then the kicker."],
          ["葫芦：三条加一对，先比三条，再比对子。", "Full house: three of a kind and a pair; compare the triplet first."],
          ["同花：五张同花色，由大到小逐张比较。", "Flush: five cards of one suit; compare ranks from highest down."],
          ["顺子：五张连续牌。A 可在 A2345 中当最小，也可在 10JQKA 中当最大，不能绕接 KA234。", "Straight: five consecutive ranks. A is low in A2345 or high in 10JQKA; KA234 is not a straight."],
          ["三条：三张同点数，再比较两张踢脚牌。", "Three of a kind: compare the triplet, then the two kickers."],
          ["两对：先比大对子，再比小对子，最后比单张。", "Two pair: compare the higher pair, the lower pair, then the kicker."],
          ["一对：先比对子，再依次比三张踢脚牌。", "One pair: compare the pair, then all three kickers."],
          ["高牌：以上都没有，由大到小比较五张牌。", "High card: none of the above; compare all five ranks in descending order."]
        ] },
        { id: "pots", title: ["摊牌、边池与平分", "Showdown & side pots"], paragraphs: [
          ["有人投入的筹码较少时，按各人投入分主池和边池。每个池只在对该池有投入、且未弃牌的人之间比较；筹码最少的人不能赢自己没覆盖的边池。", "Unequal all-ins split contributions into a main pot and side pots. Each pot is contested only by non-folded players who contributed to it. A short stack cannot win a side pot it did not cover."],
          ["最佳五张牌完全相同则平分该池，多出来的单个筹码按庄家之后的座位顺序分配。只剩一人未弃牌时直接获胜，无须发完公共牌。", "Identical best five-card hands split that pot. Odd chips go in seat order after the dealer. If only one player has not folded, that player wins immediately without completing the board."]
        ] }, room
      ], sources: [
        ["PokerStars · Texas Hold'em", "https://www.pokerstars.com/poker/games/texas-holdem/"],
        ["PokerStars · Betting & side pots", "https://www.pokerstars.com/help/articles/poker-rules-master/"]
      ]
    },
    gomoku: {
      title: ["五子棋规则", "Gomoku Rules"], sections: [
        { id: "goal", title: ["五子相连即胜", "Five in a row"], paragraphs: [
          ["两人对弈，使用 15×15 的棋盘。黑棋先行，之后双方轮流在空交叉点放一枚自己的棋子。落下的棋子不移动，也不吃子。", "Two players use a 15×15 board. Black plays first, then players alternate placing one stone on an empty intersection. Placed stones do not move and are not captured."],
          ["先在横线、竖线或任一斜线上，把自己的五枚或更多棋子连续连起来的人获胜。中间有空位或对手棋子就不算连续。", "Win by making an unbroken horizontal, vertical or diagonal line of five or more of your stones. An empty intersection or opposing stone breaks the line."]
        ] },
        { id: "variant", title: ["本馆采用自由五子棋", "Freestyle at this club"], paragraphs: [
          ["双方都没有三三、四四或长连禁手。六子及以上的长连也算获胜；第一手可放在任意空点。不开局交换三手，不使用 Swap2 或连珠禁手规则。", "Neither side has double-three, double-four or overline restrictions. Six or more in a row also wins, and the first move may be anywhere. There is no Swap2 opening or Renju forbidden-move system."],
          ["棋盘填满仍无人连成五子，则和棋。双方同意求和也可结束；认输则对手获胜。", "A full board with no winning line is a draw. An agreed draw also ends the game; resignation awards the win to the opponent."]
        ] },
        { id: "consent", title: ["悔棋与再来一局", "Undo & rematch"], paragraphs: [
          ["好友对局中的悔棋、求和和换边再来，需要对手同意。悔棋后回到撤回的局面与行动顺序；再来一局会交换黑白方。", "Undo, draw and rematch requests in friend games require the opponent's consent. Undo restores the earlier position and turn; a rematch swaps colors."]
        ] }, room
      , localBoard], sources: [["RIF · Tournament variants (本馆采用自由规则 / Club uses freestyle)", "https://gomoku.renju.net/gomokurules/"]]
    },
    xiangqi: {
      title: ["中国象棋规则", "Xiangqi Rules"], sections: [
        { id: "goal", title: ["开局与胜负", "Setup & winning"], paragraphs: [
          ["棋盘为九路十线，棋子放在交叉点。红黑各 16 枚，红方先行，每次移动一枚自己的棋子。落在对手棋子上就吃掉它，不能落在己方棋子上。", "The board has nine files and ten ranks; pieces sit on intersections. Each side has 16 pieces and Red moves first. Move one piece per turn, capturing an opposing piece on its destination. You cannot land on your own piece."],
          ["目标是将死对方将帅。被将军时必须解除威胁，不能走完后让自己的将帅仍受攻击；轮到某方却没有合法着法，即使没被将军也判负，叫作困毙。", "Checkmate the opposing general. A move must leave your own general safe, including when escaping check. A player with no legal move loses even when not in check: stalemate is a loss."]
        ] },
        { id: "pieces", title: ["七种棋子的走法", "How the pieces move"], items: [
          ["帅／将：九宫内沿横线或竖线走一格。两将帅之间若没有任何棋子，不能在同一路直接照面。", "General: one orthogonal step within the palace. The generals may not face each other along an unobstructed file."],
          ["仕／士：九宫内斜走一格，不能出宫。", "Advisor: one diagonal step, staying inside the palace."],
          ["相／象：斜走两格，走「田」字，不能过河。中间一格有棋子就被塞象眼，不能通过。", "Elephant: two diagonal steps, without crossing the river. A piece at the midpoint blocks the move."],
          ["马：先横或竖走一格，再向外斜走一格，走「日」字。第一步的相邻格有棋子就被蹩马腿。", "Horse: one orthogonal step followed by one outward diagonal step. A piece on the first orthogonal square blocks that direction."],
          ["车：沿横线或竖线走任意格数，不能越过其他棋子。", "Chariot: any number of orthogonal steps, without jumping over pieces."],
          ["炮：不吃子时像车一样走；吃子时，炮与目标之间必须恰好隔一枚棋子，双方棋子都可以当炮架。", "Cannon: moves like a chariot without capturing. A capture requires exactly one intervening piece of either color as a screen."],
          ["兵／卒：每次向前一格。过河后可向左或右一格，但始终不能后退，也不能升变。", "Soldier: one forward step. After crossing the river it may also step sideways, but never backward. It does not promote."]
        ] },
        { id: "draws", title: ["重复局面与和棋", "Repetition & draws"], paragraphs: [
          ["本馆采用休闲判定：同一局面及行棋方第三次出现时，若只有一方持续将军，则长将方判负；其他三次重复判和。这里不采用正式比赛中复杂的长捉仲裁。", "Club adjudication: on the third occurrence of the same position and side to move, a sole perpetual checker loses; other threefold repetitions draw. Tournament adjudication of repeated chasing is not used."],
          ["双方都只剩将帅、士、象等防守棋子，或连续 120 个半回合没有吃子，也判和。一方走一次算一个半回合；双方同意求和可提前和棋。", "A draw also occurs when both sides have only generals, advisors and elephants, or after 120 consecutive plies without a capture. One player's move is one ply. Players may also agree to a draw."]
        ] },
        { id: "consent", title: ["悔棋与再来一局", "Undo & rematch"], paragraphs: [
          ["好友对局中的悔棋、求和和换边再来，需要对手同意。认输则对手获胜；再来一局会交换红黑方，仍由红方先行。", "Undo, draw and rematch requests in friend games need the opponent's consent. Resigning awards the win to the opponent. Rematches swap Red and Black, with Red still moving first."]
        ] }, room
      , localBoard], sources: [
        ["World Xiangqi Federation · Introduction", "https://www.wxf-xiangqi.org/images/free_download_books/xiangqi_introduction_chessplayers_20150323.pdf"],
        ["World Xiangqi Federation · Rules", "https://www.wxf-xiangqi.org/images/wxf-rules/2018_World_XiangQi_Rules_English2018.pdf"]
      ]
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  else root.BoardGameRuleData = data;
})(typeof window !== "undefined" ? window : globalThis);
