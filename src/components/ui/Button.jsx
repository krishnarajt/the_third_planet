const VARIANTS = {
  primary:
    'bg-savanna text-abyss hover:bg-summit active:translate-y-px shadow-[0_3px_0_0_#a2761f] active:shadow-[0_1px_0_0_#a2761f] font-bold',
  secondary:
    'bg-shelf text-chalk hover:bg-tide border border-tide active:translate-y-px shadow-[0_3px_0_0_#0b2429] active:shadow-[0_1px_0_0_#0b2429] font-semibold',
  quiet: 'text-foam hover:text-chalk hover:bg-shelf/60 font-medium',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-[15px] rounded-xl',
  lg: 'px-5 py-3 text-base rounded-xl',
};

export default function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  as: Tag = 'button',
  ...props
}) {
  return (
    <Tag
      className={`inline-flex items-center justify-center gap-2 transition-[background-color,color,transform,box-shadow] duration-100 disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
