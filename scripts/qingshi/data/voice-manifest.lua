-- 自动生成:配音清单(gen-manifest.js)。仅收录磁盘上存在的音频,勿手改。
-- chapters[剧本][章节] = { intro={路径...}, events={ [事件id]={segs={...},opts={...}} } }
-- cards[剧本][行动id] = { segs={...} } ; endings[剧本][结局key(可含__变体)] = 路径
return {
  chapters = {
    lisi = {
      c0 = {
        intro = { "audio/voice/lisi_c0_intro_1.ogg", "audio/voice/lisi_c0_intro_2.ogg", "audio/voice/lisi_c0_intro_3.ogg", "audio/voice/lisi_c0_intro_4.ogg" },
        events = {
          ["0-1"] = { segs = { "audio/voice/lisi_c0_0-1_s1.ogg", "audio/voice/lisi_c0_0-1_s2.ogg", "audio/voice/lisi_c0_0-1_s3.ogg", "audio/voice/lisi_c0_0-1_s4.ogg", "audio/voice/lisi_c0_0-1_s5.ogg" }, opts = { "audio/voice/lisi_c0_0-1_o1.ogg", "audio/voice/lisi_c0_0-1_o2.ogg", "audio/voice/lisi_c0_0-1_o3.ogg" } },
          ["0-2"] = { segs = { "audio/voice/lisi_c0_0-2_s1.ogg", "audio/voice/lisi_c0_0-2_s2.ogg", "audio/voice/lisi_c0_0-2_s3.ogg", "audio/voice/lisi_c0_0-2_s4.ogg", "audio/voice/lisi_c0_0-2_s5.ogg" }, opts = { "audio/voice/lisi_c0_0-2_o1.ogg", "audio/voice/lisi_c0_0-2_o2.ogg" } },
          ["0-3"] = { segs = { "audio/voice/lisi_c0_0-3_s1.ogg", "audio/voice/lisi_c0_0-3_s2.ogg", "audio/voice/lisi_c0_0-3_s3.ogg", "audio/voice/lisi_c0_0-3_s4.ogg", "audio/voice/lisi_c0_0-3_s5.ogg" }, opts = { "audio/voice/lisi_c0_0-3_o1.ogg", "audio/voice/lisi_c0_0-3_o2.ogg" } },
          ["0-4"] = { segs = { "audio/voice/lisi_c0_0-4_s1.ogg", "audio/voice/lisi_c0_0-4_s2.ogg", "audio/voice/lisi_c0_0-4_s3.ogg", "audio/voice/lisi_c0_0-4_s4.ogg", "audio/voice/lisi_c0_0-4_s5.ogg" }, opts = { "audio/voice/lisi_c0_0-4_o1.ogg", "audio/voice/lisi_c0_0-4_o2.ogg" } },
        },
      },
    },
  },
  cards = {
  },
  endings = {
  },
}
