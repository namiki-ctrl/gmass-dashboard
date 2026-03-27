// ============================================================
// GMass Dashboard 用 Google Apps Script
// ============================================================
// 【設定方法】
// 1. https://script.google.com を開く
// 2. 「新しいプロジェクト」をクリック
// 3. このコードを全て貼り付ける
// 4. 下の YOUR_API_KEY を自分のGMass APIキーに書き換える
// 5. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
//    → アクセスできるユーザー「全員」→「デプロイ」
// 6. 表示されるURLをコピーしてダッシュボードに貼り付ける
// ============================================================

const API_KEY = 'YOUR_API_KEY';  // ← ここにGMassのAPIキーを貼り付け
const GMASS_BASE = 'https://api.gmass.co/api';

// ── メインハンドラ ──
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'campaigns';

  let result;
  try {
    switch (action) {
      case 'test':
        result = testConnection();
        break;
      case 'campaigns':
        result = fetchCampaigns();
        break;
      case 'opens':
        result = fetchOpens(e.parameter.campaignId);
        break;
      case 'replies':
        result = fetchReplies(e.parameter.campaignId);
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message || String(err) };
  }

  const json = JSON.stringify(result);
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 接続テスト ──
function testConnection() {
  const url = GMASS_BASE + '/campaigns?apikey=' + API_KEY + '&limit=1';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code === 200) {
    return { ok: true, message: '接続成功！APIキーは有効です。' };
  } else if (code === 401) {
    return { ok: false, message: 'APIキーが無効です。GMassの設定画面で確認してください。' };
  } else {
    return { ok: false, message: 'エラー (HTTP ' + code + '): ' + res.getContentText() };
  }
}

// ── キャンペーン一覧取得 ──
function fetchCampaigns() {
  const url = GMASS_BASE + '/campaigns?apikey=' + API_KEY;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('API error: ' + res.getResponseCode());
  }
  const campaigns = JSON.parse(res.getContentText());

  // ダッシュボード用に整形
  const result = campaigns
    .filter(function(c) { return c.status === 'sent'; })
    .map(function(c) {
      var s = c.statistics || {};
      var recipients = s.recipients || 0;
      var opens = s.opens || 0;
      var replies = s.replies || 0;
      var bounces = s.bounces || 0;
      var clicks = s.clicks || 0;
      var unsubscribes = s.unsubscribes || 0;
      return {
        campaignId: c.campaignId,
        subject: c.subject || '(件名なし)',
        friendlyName: c.friendlyName || '',
        creationTime: c.creationTime,
        status: c.status,
        recipients: recipients,
        opens: opens,
        replies: replies,
        bounces: bounces,
        clicks: clicks,
        unsubscribes: unsubscribes,
        openRate: recipients > 0 ? opens / recipients : 0,
        replyRate: recipients > 0 ? replies / recipients : 0,
        bounceRate: recipients > 0 ? bounces / recipients : 0,
        clickRate: recipients > 0 ? clicks / recipients : 0,
        stage: c.stage || 1
      };
    });

  return { ok: true, campaigns: result };
}

// ── 開封詳細取得 ──
function fetchOpens(campaignId) {
  if (!campaignId) throw new Error('campaignId is required');
  var allData = [];
  var offset = 0;
  var limit = 500;

  // ページネーションで全件取得
  while (true) {
    var url = GMASS_BASE + '/reports/' + campaignId + '/opens?apikey=' + API_KEY
      + '&limit=' + limit + '&offset=' + offset;
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) break;
    var body = JSON.parse(res.getContentText());
    var data = body.data || body;
    if (!Array.isArray(data) || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < limit) break;
    offset += limit;
  }

  // 集計
  var openCounts = [];
  var openTimes = [];
  for (var i = 0; i < allData.length; i++) {
    var d = allData[i];
    if (d.openCount) openCounts.push(d.openCount);
    if (d.lastOpenTime) openTimes.push(d.lastOpenTime);
  }
  var total = openCounts.reduce(function(a, b) { return a + b; }, 0);
  var avgOpenCount = openCounts.length > 0 ? total / openCounts.length : 0;
  var maxOpenCount = openCounts.length > 0 ? Math.max.apply(null, openCounts) : 0;

  return {
    ok: true,
    campaignId: campaignId,
    openers: allData.length,
    openCounts: openCounts,
    openTimes: openTimes,
    avgOpenCount: avgOpenCount,
    maxOpenCount: maxOpenCount
  };
}

// ── 返信詳細取得 ──
function fetchReplies(campaignId) {
  if (!campaignId) throw new Error('campaignId is required');
  var url = GMASS_BASE + '/reports/' + campaignId + '/replies?apikey=' + API_KEY + '&limit=500';
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('API error: ' + res.getResponseCode());
  }
  var body = JSON.parse(res.getContentText());
  var data = body.data || body;
  return {
    ok: true,
    campaignId: campaignId,
    replies: Array.isArray(data) ? data.length : 0,
    data: data
  };
}
