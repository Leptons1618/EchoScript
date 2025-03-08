import os
from notion_client import Client
from config import logger

def export_to_notion(content, notion_token=None, parent_page_id=None):
    """Export transcript and notes to Notion by creating a new page
    
    Args:
        content: Dictionary containing transcript, summary, and other metadata
        notion_token: Notion API token
        parent_page_id: ID of the parent Notion page
        
    Returns:
        dict: Result of operation with success status and page URL
    """
    try:
        # Get API key either from parameter or environment variable
        notion_token = notion_token or os.getenv('NOTION_API_KEY')
        
        # Get parent page ID either from parameter or environment variable
        parent_page_id = parent_page_id or os.getenv('NOTION_PARENT_PAGE_ID')
        
        if not notion_token or not parent_page_id or not content:
            return {
                'success': False,
                'error': 'Missing required parameters. Please provide Notion token and page ID or set them in environment variables.'
            }
        
        # Initialize Notion client
        notion = Client(auth=notion_token)
        
        try:
            # Create a new page with the transcript title
            page_title = content.get('title', 'YouTube Video Transcript')
            
            # Create a new page in the parent database/page
            new_page = notion.pages.create(
                parent={"page_id": parent_page_id},
                properties={
                    "title": {
                        "title": [
                            {
                                "text": {
                                    "content": page_title
                                }
                            }
                        ]
                    }
                }
            )
            
            # Get the ID of the newly created page
            new_page_id = new_page["id"]
            
            # Format content for Notion blocks
            blocks = []
            
            # Add metadata (URL, channel)
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [
                        {"type": "text", "text": {"content": "Channel: "}},
                        {"type": "text", "text": {"content": content['channel']}, "annotations": {"bold": True}}
                    ]
                }
            })
            
            if content.get('url'):
                blocks.append({
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [
                            {"type": "text", "text": {"content": "URL: "}},
                            {"type": "text", "text": {"content": content['url']}, "annotations": {"underline": True}, "href": content['url']}
                        ]
                    }
                })
            
            # Add divider
            blocks.append({"object": "block", "type": "divider", "divider": {}})
            
            # Add summary section if available
            if content.get('summary'):
                blocks.append({
                    "object": "block",
                    "type": "heading_2",
                    "heading_2": {
                        "rich_text": [{"type": "text", "text": {"content": "Summary"}}]
                    }
                })
                
                blocks.append({
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [{"type": "text", "text": {"content": content['summary']}}]
                    }
                })
                
                # Add divider
                blocks.append({"object": "block", "type": "divider", "divider": {}})
            
            # Add key points if available
            if content.get('keyPoints') and len(content['keyPoints']) > 0:
                blocks.append({
                    "object": "block",
                    "type": "heading_2",
                    "heading_2": {
                        "rich_text": [{"type": "text", "text": {"content": "Key Points"}}]
                    }
                })
                
                # Add bullet list for key points
                for point in content['keyPoints']:
                    blocks.append({
                        "object": "block",
                        "type": "bulleted_list_item",
                        "bulleted_list_item": {
                            "rich_text": [{"type": "text", "text": {"content": point}}]
                        }
                    })
                
                # Add divider
                blocks.append({"object": "block", "type": "divider", "divider": {}})
            
            # Add transcript if available
            if content.get('transcript') and len(content['transcript']) > 0:
                blocks.append({
                    "object": "block",
                    "type": "heading_2",
                    "heading_2": {
                        "rich_text": [{"type": "text", "text": {"content": "Transcript"}}]
                    }
                })
                
                # Add segments with timestamps
                for segment in content['transcript']:
                    blocks.append({
                        "object": "block",
                        "type": "paragraph",
                        "paragraph": {
                            "rich_text": [
                                {"type": "text", "text": {"content": f"[{segment['time']}] "}, "annotations": {"bold": True}},
                                {"type": "text", "text": {"content": segment['text']}}
                            ]
                        }
                    })
            
            # Execute the update to Notion by adding blocks to the new page
            notion.blocks.children.append(
                block_id=new_page_id,
                children=blocks
            )
            
            # Get the URL of the newly created page to return to the user
            page_url = f"https://notion.so/{new_page_id.replace('-', '')}"
            
            return {
                'success': True, 
                'message': 'Successfully exported to Notion',
                'pageId': new_page_id,
                'pageUrl': page_url
            }
        
        except Exception as e:
            logger.error(f"Notion API error: {str(e)}")
            return {'success': False, 'error': f'Notion API error: {str(e)}'}
    
    except Exception as e:
        logger.error(f"Export to Notion error: {str(e)}")
        return {'success': False, 'error': f'Server error: {str(e)}'}
