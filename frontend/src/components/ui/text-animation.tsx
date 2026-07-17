import { cn } from "@/lib/utils";

/* Animated image-clipped text.
   The text is transparent and a background image is clipped to the glyphs
   (`bg-clip-text`), while the `animate-text` / `animate-text-reverse` keyframes
   (registered in tailwind.config.js) slowly pan the background position, giving
   the letters a shifting, living texture. */

export type AnimatedImageTextProps = {
  children: React.ReactNode;
  /** Background image URL clipped to the text. */
  image: string;
  /** Pan the texture in the opposite direction. */
  reverse?: boolean;
  className?: string;
};

export const AnimatedImageText = ({
  children,
  image,
  reverse = false,
  className,
}: AnimatedImageTextProps) => (
  <span
    className={cn(
      "text-transparent bg-contain bg-clip-text",
      reverse ? "animate-text-reverse" : "animate-text",
      className,
    )}
    style={{ backgroundImage: `url('${image}')` }}
  >
    {children}
  </span>
);

const IMAGE_ONE =
  "https://plus.unsplash.com/premium_photo-1661882403999-46081e67c401?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OXx8Y29kZXxlbnwwfHwwfHx8MA%3D%3D";
const IMAGE_TWO =
  "https://plus.unsplash.com/premium_photo-1661963874418-df1110ee39c1?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8Y29kZXxlbnwwfHwwfHx8MA%3D%3D";

export const Component = () => {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center">
      <AnimatedImageText
        image={IMAGE_ONE}
        className="m-0 text-5xl sm:text-7xl md:text-8xl font-serif font-bold uppercase opacity-80"
      >
        Text
      </AnimatedImageText>
      <AnimatedImageText
        image={IMAGE_TWO}
        className="m-0 text-5xl sm:text-7xl md:text-8xl font-serif font-bold uppercase opacity-80"
      >
        Animation
      </AnimatedImageText>
    </div>
  );
};
