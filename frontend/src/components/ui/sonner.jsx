import { Toaster as Sonner } from "sonner"

const Toaster = ({
  ...props
}) => {
  return (
    <Sonner
      position="top-right"
      expand={true}
      richColors
      closeButton
      {...props}
    />
  );
}

export { Toaster }
