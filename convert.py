#!/usr/bin/env python3
"""Python版 convert - 将MD日报转换为HTML"""
import re, os, json, html
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = BASE_DIR  # MD文件在上级目录
OUT_DIR = os.path.join(os.path.abspath(__file__).rsplit(os.sep, 1)[0], 'reports')
INDEX_JSON = os.path.join(os.path.abspath(__file__).rsplit(os.sep, 1)[0], 'reports-index.json')

WEEKDAYS = ['周日','周一','周二','周三','周四','周五','周六']

def get_weekday(date_str):
    try:
        d = datetime.strptime(date_str[:10], '%Y-%m-%d')
        return WEEKDAYS[d.weekday()]
    except:
        return ''

def parse_md(md_text, filename):
    date_str = filename[:10]
    weekday = get_weekday(date_str)
    
    date_match = re.search(r'\*\*日期[：:](.+?)\*\*', md_text)
    date_line = date_match.group(1).strip() if date_match else date_str
    
    sections = []
    
    # 解析国内动态
    domestic_match = re.search(r'## 🇨🇳 国内动态\s*(.*?)(?=## 🌍 国际动态|## 📊 总结)', md_text, re.DOTALL)
    if domestic_match:
        items = parse_items(domestic_match.group(1))
        if items:
            sections.append({'type': 'domestic', 'title': '国内动态', 'items': items})
    
    # 解析国际动态
    intl_match = re.search(r'## 🌍 国际动态\s*(.*?)(?=## 📊 总结)', md_text, re.DOTALL)
    if intl_match:
        items = parse_items(intl_match.group(1))
        if items:
            sections.append({'type': 'international', 'title': '国际动态', 'items': items})
    
    return {
        'date': date_str,
        'weekday': weekday,
        'date_line': date_line,
        'sections': sections,
        'filename': filename
    }

def parse_items(text):
    items = []
    blocks = re.split(r'### ', text)
    for block in blocks[1:]:
        title_end = block.find('\n')
        title = block[:title_end].strip() if title_end > 0 else ''
        
        link_matches = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', block[:3000])
        links = [{'name': n, 'url': u} for n, u in link_matches[:5]]
        
        content = re.sub(r'- \*\*来源.*?\n', '', block)
        content = re.sub(r'- \*\*时效.*?\n', '', content)
        content = re.sub(r'- \*\*链接.*?\n', '', content)
        content = re.sub(r'---\s*', '', content)
        content = re.sub(r'\n+', '\n', content).strip()
        content = html.escape(content[:800])
        
        if title and len(title) < 200:
            items.append({'title': title, 'content': content, 'links': links})
    return items

STYLE = """
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;max-width:960px;margin:0 auto;padding:20px;background:#f0f2f5;color:#1c1e21}
h1{font-size:24px;color:#1a73e8;margin-bottom:8px}
.date-info{color:#65676b;font-size:14px;margin-bottom:24px}
.card{background:#fff;border-radius:10px;padding:20px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,0,0,.1);border-left:4px solid #1a73e8}
.card-title{font-size:16px;font-weight:700;color:#1c1e21;margin-bottom:12px}
.card-content{font-size:14px;line-height:1.7;color:#65676b}
.links{margin-top:10px}.links a{display:inline-block;color:#1a73e8;font-size:12px;text-decoration:none;margin-right:12px;padding:4px 8px;background:#e7f3ff;border-radius:4px}
.section-title{font-size:20px;font-weight:700;margin:32px 0 16px;border-left:4px solid #1a73e8;padding-left:12px;color:#1c1e21}
.section{margin-bottom:24px}
.back-link{text-align:center;margin:30px 0}.back-link a{color:#1a73e8;text-decoration:none}"""

def generate_html(report):
    sections_html = ''
    for sec in report['sections']:
        items_html = ''
        for item in sec['items'][:25]:
            links_html = ''.join([f'<a href="{l["url"]}" target="_blank">{html.escape(l["name"])}</a>' for l in item.get('links', [])])
            items_html += f'''
        <div class="card">
            <div class="card-title">{html.escape(item["title"])}</div>
            <div class="card-content"><p>{item["content"]}</p>
                <div class="links">{links_html}</div></div></div>'''
        
        sections_html += f'''<section class="section">
        <h2 class="section-title">{sec["title"]}</h2>
        <div class="cards">{items_html}</div></section>'''
    
    return f'''<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{report["date"]} 未成年人领域动态日报</title>
<style>{STYLE}</style></head><body>
<h1>📋 未成年人/青少年领域动态日报</h1>
<p class="date-info">📅 {report.get("date_line", report["date"])}</p>
<main>{sections_html}</main>
<div class="back-link"><a href="index.html">← 返回历史存档首页</a></div>
</body></html>'''

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    
    files = sorted([f for f in os.listdir(SRC_DIR) if re.match(r'^\d{4}-\d{2}-\d{2}-未成年动态日报\.md$', f)])
    print(f"Found {len(files)} report files in {SRC_DIR}")
    
    index = []
    
    for fname in files:
        filepath = os.path.join(SRC_DIR, fname)
        with open(filepath, 'r', encoding='utf-8') as fh:
            md_text = fh.read()
        
        report = parse_md(md_text, fname)
        
        total_items = sum(len(s['items']) for s in report['sections'])
        if total_items == 0:
            print(f"Skip {fname}: no parsed items")
            continue
        
        html_content = generate_html(report)
        
        out_name = fname.replace('.md', '.html')
        out_path = os.path.join(OUT_DIR, out_name)
        with open(out_path, 'w', encoding='utf-8') as fh:
            fh.write(html_content)
        
        dom_count = sum(len(s['items']) for s in report['sections'] if s['type']=='domestic')
        int_count = sum(len(s['items']) for s in report['sections'] if s['type']=='international')
        
        index.append({
            'date': report['date'],
            'title': f"{report['date']} 未成年人动态日报",
            'file': out_name,
            'domestic_count': dom_count,
            'international_count': int_count,
            'total': total_items
        })
        print(f"  [OK] {out_name} ({dom_count}+{int_count}={total_items})")
    
    index.sort(key=lambda x: x['date'], reverse=True)
    with open(INDEX_JSON, 'w', encoding='utf-8') as fh:
        json.dump(index, fh, ensure_ascii=False, indent=2)
    print(f"\nUpdated reports-index.json ({len(index)} entries)")

if __name__ == '__main__':
    main()
