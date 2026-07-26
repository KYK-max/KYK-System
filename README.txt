KYK Management System v1.5.1

変更内容
- v1.4.4のPDF除外、Excel出力のみの構成を維持しました。
- 作業1～4の実施人員合計に合わせて、作業員入力欄を自動で表示します。
- 実施人員合計2名なら作業員1～2、6名なら作業員1～6だけを表示します。
- 実施人員合計は1名以上8名以内です。
- 人数を減らしたとき、非表示になる作業員欄に入力済みデータがある場合は確認を表示します。
- ZIP内のフォルダ名とファイル名は文字化け防止のため英数字です。

注意
- KYKDB.xlsxは同梱していません。
- Excel読込用のSheetJSは現段階では従来どおり外部参照です。外部参照の同梱化は別段階で実施します。


v1.4.7 changes
- Bundled SheetJS locally as js/xlsx.full.min.js
- Updated index.html and Service Worker for offline SheetJS loading
- Added spacing between the two buttons on the journal auto-create screen


【v1.4.7】タブレット実機での入力操作性を改善。サイン欄・基本情報欄・保存ボタンの大型化、人数ドラム選択、資格略号表示、日誌入力欄の段階追加に対応。

【v1.4.9】戻る操作時の入力保持、作業責任者の配置変更、人数・危険評価選択欄の大型化、体調・資格の未選択表示統一に対応。


v1.4.9 変更点
- 保存後、現場名と作業日だけを残して次業者用に入力内容を初期化
- 総合点・点検チェック・体調表示の操作性と外観を調整


v1.5.1 変更点
- バージョン表示、APP_VERSION、version.json、Service Workerを1.5.0に統一
- Build 2026-07-26 11:44 JSTを画面に表示
- CSS・JavaScript等に?v=1.5.0を付与してキャッシュ更新を明確化


【v1.5.1 変更点】
・基本情報を3行固定、各入力欄を同寸法化
・iPad Safari向けフォーム表示を調整
・危険性欄を大型化し、評価欄を下段配置
・Build 2026-07-26 11:55 JST
