import React from 'react';

export interface MotionWrapperProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  enableHoverEffect?: boolean;
  enableTapEffect?: boolean;
  onClick?: () => void;
  style?: any;
  className?: string;
}

export const MotionWrapper: React.FC<MotionWrapperProps> = ({
  children,
  enableHoverEffect = true,
  enableTapEffect = true,
  onClick,
  style,
  className,
  ...props
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);

  // Safely flatten React Native style array if passed to DOM element
  const flatStyle = React.useMemo(() => {
    if (!style) return {};
    if (Array.isArray(style)) {
      return Object.assign({}, ...style.filter(Boolean));
    }
    return typeof style === 'object' ? { ...style } : {};
  }, [style]);

  const combinedStyle: React.CSSProperties = {
    transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease, border-color 0.3s ease',
    transform: isPressed && enableTapEffect
      ? 'scale(0.98)'
      : isHovered && enableHoverEffect
      ? 'translateY(-3px) scale(1.008)'
      : 'translateY(0) scale(1)',
    cursor: onClick || enableHoverEffect ? 'pointer' : 'default',
    willChange: 'transform',
    ...flatStyle,
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onClick={onClick}
      style={combinedStyle}
      className={className}
      {...props}
    >
      {children}
    </div>
  );
};

export default MotionWrapper;
