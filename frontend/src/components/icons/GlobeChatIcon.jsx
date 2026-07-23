import React from 'react';
import { MessageCircle, Globe } from 'lucide-react';

/**
 * GlobeChatIcon — DigiLab AI assistant brand icon.
 * Renders a Globe centered inside a MessageCircle bubble.
 * Both icons inherit currentColor automatically.
 *
 * Usage:
 *   <GlobeChatIcon className="h-5 w-5 text-accent" />
 *   <GlobeChatIcon className="h-5 w-5 text-white" />
 */
const GlobeChatIcon = ({ className = '', size, style = {}, ...props }) => {
  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
      style={style}
      {...props}
    >
      {/* Outer chat bubble */}
      <MessageCircle className="w-full h-full" />

      {/* Globe centered inside the bubble.
          Positioned absolutely, centered, sized ~58% of the container. */}
      <Globe
        className="absolute"
        style={{
          width: '58%',
          height: '58%',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -54%)', /* slight upward offset to stay inside the bubble body, above the tail */
        }}
      />
    </span>
  );
};

export default GlobeChatIcon;
