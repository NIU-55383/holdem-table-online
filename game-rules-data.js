(function (root) {
  "use strict";
  const room = {
    id: "room", title: ["房间与托管", "Room & auto-play"], paragraphs: [
      ["房主可以补机器人、转让房主或移出玩家。开局后留下空位时暂停，补齐后从原局面继续。掉线不会自动替你行动。", "The host can add bots, transfer hosting or remove players. An empty seat pauses the game; filling it resumes the same position. Disconnecting does not automatically play for you."],
      ["两分钟未操作自动托管默认关闭，仅房主可统一开启；开启后会在接管前提示。每位玩家仍可主动开启或停止自己的托管。", "Two-minute idle auto-play is off by default. Only the host can enable it for the room, with a warning before takeover. Each player can still start or stop personal auto-play."]
    ]
  };
  const data = {
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
      ], sources: [["RIF · Tournament variants (本馆采用自由规则 / Club uses freestyle)", "https://gomoku.renju.net/gomokurules/"]]
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
      ], sources: [
        ["World Xiangqi Federation · Introduction", "https://www.wxf-xiangqi.org/images/free_download_books/xiangqi_introduction_chessplayers_20150323.pdf"],
        ["World Xiangqi Federation · Rules", "https://www.wxf-xiangqi.org/images/wxf-rules/2018_World_XiangQi_Rules_English2018.pdf"]
      ]
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  else root.BoardGameRuleData = data;
})(typeof window !== "undefined" ? window : globalThis);
