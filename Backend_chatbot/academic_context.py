"""
Academic Context Enhancer for IGNOU MJM-023 and related courses.

Previously this file was dead code (never imported anywhere).
Now it provides course structure awareness that can be used by
the hybrid retriever and chatbot.
"""

class AcademicContextEnhancer:
    """Add academic context to improve understanding of course material."""
    
    def __init__(self):
        # Extended course topic aliases — maps student terminology to 
        # how it actually appears in the IGNOU PDFs
        self.course_topics = {
            # Research methods
            'digital survey': ['online research', 'internet methodology', 'web-based research', 'online questionnaire'],
            'life cycle': ['research process', 'methodological steps', 'phases', 'stages of research'],
            'sampling': ['population selection', 'participant recruitment', 'sample frame', 'sampling error'],
            'data analysis': ['statistical interpretation', 'findings evaluation', 'data processing', 'coding'],
            'digital divide': ['access limitations', 'coverage error', 'representation issues', 'internet penetration'],
            
            # Journalism
            'online journalism': ['digital journalism', 'web journalism', 'cyber journalism', 'internet journalism'],
            'citizen journalism': ['participatory journalism', 'user-generated content', 'grassroots journalism'],
            'time-shift journalism': ['asynchronous news', 'on-demand news', 'archived news', 'non-linear consumption'],
            'convergence': ['media convergence', 'digital convergence', 'newsroom convergence'],
            'fake news': ['misinformation', 'disinformation', 'information disorder'],
            
            # Broadcasting
            'radio': ['radio broadcasting', 'radio journalism', 'radio production', 'community radio'],
            'television': ['TV broadcasting', 'television journalism', 'TV production'],
            
            # Digital media
            'social media': ['social networking', 'social platforms', 'user-generated media'],
            'multimedia': ['rich media', 'interactive media', 'cross-media'],
            'blog': ['blogging', 'web log', 'online publishing'],
        }
        
        # Full course structure for MJM-023 blocks
        self.course_structure = {
            # Block 1
            'Block 1': 'Radio Journalism',
            'Unit 1': 'Radio Technology and Growth',
            'Unit 2': 'Radio News',
            'Unit 3': 'News Bulletin Formats',
            'Unit 4': 'External Broadcasting',
            'Unit 5': 'Presentation Techniques',
            
            # Add more blocks as PDFs are added to the knowledge base
            # Block 2, 3, etc. can be extended here
        }
    
    def enhance_query_context(self, question: str, context: str) -> str:
        """
        Add course-specific context to improve answer quality.
        
        This is called by the hybrid retriever to enrich the context
        before it reaches the LLM.
        """
        enhanced = context
        
        # Add course structure awareness when student references units/chapters
        if any(keyword in question.lower() for keyword in ['unit', 'chapter', 'block', 'syllabus']):
            enhanced += "\n\n[Course Structure Reference]\n"
            for unit, title in self.course_structure.items():
                enhanced += f"{unit}: {title}\n"
        
        # Add topic cross-references
        for topic, related in self.course_topics.items():
            if topic in question.lower():
                enhanced += f"\n\n[Related Course Topics: {', '.join(related)}]"
                break
        
        return enhanced
    
    def get_topic_aliases(self, topic: str) -> list:
        """Get all known aliases for a topic. Used by query expander."""
        topic_lower = topic.lower()
        
        if topic_lower in self.course_topics:
            return self.course_topics[topic_lower]
        
        # Fuzzy match — check if the topic appears in any key
        for key, aliases in self.course_topics.items():
            if topic_lower in key or key in topic_lower:
                return aliases
        
        return []
