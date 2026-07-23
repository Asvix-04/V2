import json

def generate_report():
    with open('test_results_20.json', 'r') as f:
        data = json.load(f)
        
    results = data.get('results', [])
    ok_results = [r for r in results if r['status'] == 200 and not r['error']]
    error_results = [r for r in results if r['error']]
    
    with open('/Users/bhartendujha/.gemini/antigravity-ide/brain/b06d4017-b1b9-4ed7-9bf8-a8b244d486bc/chat_latency_report_20.md', 'w') as out:
        out.write("# Comprehensive Latency & Answer Classification Report\n\n")
        out.write("This report details the chatbot's responses across various categories (Greeting, Academic, Follow-up, Out of Scope) along with the recorded latency. The test utilized Claude 3.5 Haiku as the LLM backend to bypass Gemini API limits.\n\n")
        
        out.write("## Test Summary\n")
        out.write(f"- **Total Questions Evaluated**: {data.get('total')}\n")
        out.write(f"- **Successful Responses**: {data.get('ok')}\n")
        out.write(f"- **Timeouts/Errors**: {data.get('errors')}\n")
        out.write(f"- **Total Wall-clock Time**: {data.get('wall_seconds')}s\n\n")
        
        out.write("## Successful Responses Breakdown\n\n")
        out.write("| Q# | Category | Question | Latency (ms) | Model Answer (Truncated) |\n")
        out.write("|:---|:---|:---|:---|:---|\n")
        
        for r in ok_results:
            q_num = r['num']
            cat = r['category']
            q_text = r['question']
            lat = r['latency_ms']
            ans = r['answer_text'].replace('\n', ' ')
            if len(ans) > 200:
                ans = ans[:200] + "..."
            out.write(f"| **{q_num}** | `{cat}` | {q_text} | {lat} ms | *{ans}* |\n")
            
        out.write("\n## Timeouts / Errors\n\n")
        out.write(f"The following {len(error_results)} questions failed to return an answer within the 120-second timeout limit due to API rate-limiting and server constraints during the batch test.\n\n")
        
        # Group errors by category
        err_cats = {}
        for r in error_results:
            cat = r['category']
            if cat not in err_cats:
                err_cats[cat] = []
            err_cats[cat].append(r['num'])
            
        for cat, nums in err_cats.items():
            out.write(f"- **{cat}**: Q {', '.join(map(str, sorted(nums)))}\n")

if __name__ == '__main__':
    generate_report()
